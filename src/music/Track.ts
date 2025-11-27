import { AudioResource, createAudioResource, demuxProbe } from '@discordjs/voice';
import { spawn } from 'child_process';
import ytSearch from 'yt-search';
import path from 'path';

const ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp');

export interface TrackData {
    url: string;
    title: string;
    onStart: () => void;
    onFinish: () => void;
    onError: (error: Error) => void;
}

// Clase auxiliar para envolver la lógica de crear una Pista desde una URL de video
export class Track {
    public readonly url: string;
    public readonly title: string;
    public readonly onStart: () => void;
    public readonly onFinish: () => void;
    public readonly onError: (error: Error) => void;
    private cachedResource: AudioResource<Track> | null = null;
    private isPreloading = false;

    // Cache simple para resultados de búsqueda: query -> { url, title }
    private static searchCache = new Map<string, { url: string, title: string }>();

    private constructor({ url, title, onStart, onFinish, onError }: TrackData) {
        this.url = url;
        this.title = title;
        this.onStart = onStart;
        this.onFinish = onFinish;
        this.onError = onError;
    }

    /**
     * Cleans up resources associated with this track.
     */
    public destroy(): void {
        this.cachedResource = null;
        this.isPreloading = false;
        // Note: We can't easily kill the spawn process from here if it's running inside a promise in createAudioResource
        // but clearing the cachedResource helps memory.
    }

    /**
     * Pre-loads the audio resource in the background.
     */
    public preload(): void {
        if (this.cachedResource || this.isPreloading) {
            return; // Already cached or currently loading
        }

        this.isPreloading = true;
        console.log(`[DEBUG] Pre-cargando recurso de audio para: ${this.title}`);

        this.createAudioResource()
            .then(resource => {
                this.cachedResource = resource;
                this.isPreloading = false;
                console.log(`[DEBUG] Pre-carga exitosa: ${this.title}`);
            })
            .catch(error => {
                this.isPreloading = false;
                console.warn(`[DEBUG] Fallo en pre-carga para ${this.title}:`, error.message);
            });
    }

    /**
     * Creates an AudioResource from this Track.
     */
    public async createAudioResource(): Promise<AudioResource<Track>> {
        // If we have a cached resource, return it immediately
        if (this.cachedResource) {
            console.log(`[DEBUG] Usando recurso en caché para: ${this.title}`);
            const resource = this.cachedResource;
            this.cachedResource = null; // Clear cache after use
            return resource;
        }

        console.log(`[DEBUG] Creando recurso de audio para URL: ${this.url}`);

        // Try multiple strategies in order
        const strategies = [
            { name: 'chrome cookies', args: ['--cookies-from-browser', 'chrome'] },
            { name: 'firefox cookies', args: ['--cookies-from-browser', 'firefox'] },
            { name: 'no cookies', args: [] },
        ];

        for (const strategy of strategies) {
            try {
                console.log(`[DEBUG] Intentando con ${strategy.name}...`);
                // Use 'bestaudio/best' to let yt-dlp decide the best format
                return await this.tryCreateResource(strategy.args);
            } catch (error) {
                console.warn(`[DEBUG] Falló con ${strategy.name}:`, (error as Error).message);
                // Continue to next strategy
            }
        }

        // If all strategies failed, throw the last error
        throw new Error('Failed to create audio resource with all strategies');
    }

    /**
     * Attempts to create an audio resource with specific yt-dlp arguments.
     */
    private async tryCreateResource(extraArgs: string[]): Promise<AudioResource<Track>> {
        return new Promise((resolve, reject) => {
            const args = [
                '-f', 'bestaudio/best', // Let yt-dlp decide: best audio or best video+audio
                '-o', '-',
                '-q',
                '--no-warnings',
                '--no-playlist',
                '--no-check-certificate',
                '--prefer-free-formats',
                '--buffer-size', '16K',
                '--no-part', // No usar archivos .part (escritura directa)
                '--no-mtime', // No modificar tiempos de archivo
                ...extraArgs,
                this.url
            ];

            const process = spawn(ytDlpPath, args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            if (!process.stdout) {
                reject(new Error('No stdout from yt-dlp process'));
                return;
            }

            const stream = process.stdout;
            let stderrOutput = '';

            process.stderr?.on('data', (data) => {
                const message = data.toString();
                stderrOutput += message;
                if (!message.includes('Broken pipe')) {
                    // console.warn(`[yt-dlp stderr]: ${message}`); // Reduce noise
                }
            });

            const onError = (error: Error) => {
                if (!process.killed) process.kill();
                stream.resume();

                // Check specific errors
                if (stderrOutput.includes('Sign in to confirm') || stderrOutput.includes('not a bot')) {
                    reject(new Error('YouTube bot detection'));
                } else if (stderrOutput.includes('Requested format is not available')) {
                    reject(new Error('Requested format is not available'));
                } else {
                    reject(error);
                }
            };

            process.once('spawn', () => {
                demuxProbe(stream)
                    .then((probe) => {
                        resolve(
                            createAudioResource(probe.stream, {
                                inputType: probe.type,
                                metadata: this,
                            }),
                        );
                    })
                    .catch(onError);
            });

            process.on('error', onError);
        });
    }

    /**
     * Creates a Track from a video URL and lifecycle callbacks.
     */
    public static async from(url: string, methods: Pick<TrackData, 'onStart' | 'onFinish' | 'onError'>): Promise<Track> {
        let videoUrl = url;
        let title = 'Unknown Title';

        const noop = () => { };

        if (!url.startsWith('http')) {
            // Verificar caché primero
            const cached = Track.searchCache.get(url);
            if (cached) {
                console.log(`[DEBUG] Cache hit para: ${url}`);
                videoUrl = cached.url;
                title = cached.title;
            } else {
                console.log(`[DEBUG] Buscando: ${url}`);

                try {
                    // Intento 1: yt-search (Muy rápido y ligero) - AHORA PRIMARIO
                    const result = await ytSearch(url);

                    if (result && result.videos.length > 0) {
                        const video = result.videos[0];
                        videoUrl = video.url;
                        title = video.title;
                        console.log(`[DEBUG] Encontrado con yt-search: ${title}`);

                        Track.searchCache.set(url, { url: videoUrl, title });
                    } else {
                        throw new Error('yt-search no results');
                    }
                } catch (ytSearchError) {
                    console.warn('[WARN] yt-search falló, usando yt-dlp (lento)...');

                    // Intento 2: Búsqueda con yt-dlp directamente (Último recurso)
                    const searchQuery = `ytsearch1:${url}`;

                    const strategies = [
                        { name: 'chrome cookies', args: '--cookies-from-browser chrome' },
                        { name: 'firefox cookies', args: '--cookies-from-browser firefox' },
                        { name: 'no cookies', args: '' },
                    ];

                    let found = false;
                    let lastError: Error | null = null;

                    for (const strategy of strategies) {
                        try {
                            console.log(`[DEBUG] Intentando búsqueda con ${strategy.name}...`);
                            // Agregamos --flat-playlist para que sea más rápido (solo metadatos)
                            const { stdout } = await execCommand(
                                `${ytDlpPath} ${strategy.args} --flat-playlist --get-title --get-id "${searchQuery}"`,
                                { encoding: 'utf-8' }
                            );

                            const lines = stdout.trim().split('\n');
                            if (lines.length >= 2) {
                                title = lines[0];
                                const videoId = lines[1];
                                videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                                console.log(`[DEBUG] Encontrado con yt-dlp (${strategy.name}): ${title}`);
                                found = true;

                                Track.searchCache.set(url, { url: videoUrl, title });
                                break;
                            }
                        } catch (error) {
                            lastError = error as Error;
                        }
                    }

                    if (!found) {
                        throw lastError || new Error('No results found with any strategy');
                    }
                }
            }
        } else {
            videoUrl = url;
        }

        const wrappedMethods = {
            onStart() {
                wrappedMethods.onStart = noop;
                methods.onStart();
            },
            onFinish() {
                wrappedMethods.onFinish = noop;
                methods.onFinish();
            },
            onError(error: Error) {
                wrappedMethods.onError = noop;
                methods.onError(error);
            },
        };

        return new Track({
            url: videoUrl,
            title,
            ...wrappedMethods,
        });
    }
}

function execCommand(command: string, options: any): Promise<{ stdout: string }> {
    return new Promise((resolve, reject) => {
        require('child_process').exec(command, options, (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
                reject(error);
            } else {
                resolve({ stdout });
            }
        });
    });
}
