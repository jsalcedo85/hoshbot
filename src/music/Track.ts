import { AudioResource, createAudioResource, demuxProbe } from '@discordjs/voice';
import { spawn } from 'child_process';
import YouTube from 'youtube-sr';
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

    private constructor({ url, title, onStart, onFinish, onError }: TrackData) {
        this.url = url;
        this.title = title;
        this.onStart = onStart;
        this.onFinish = onFinish;
        this.onError = onError;
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

        return new Promise((resolve, reject) => {
            const process = spawn(ytDlpPath, [
                '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best',
                '--extract-audio',
                '--format-sort', 'acodec:opus,acodec:aac',
                '-o', '-',
                '-q', // quiet mode, but we can still capture stderr if needed
                '--no-warnings',
                '--no-playlist',
                '--no-check-certificate',
                '--prefer-free-formats',
                '--buffer-size', '16K',
                this.url
            ], {
                stdio: ['ignore', 'pipe', 'pipe'] // Capture stderr
            });

            if (!process.stdout) {
                reject(new Error('No stdout from yt-dlp process'));
                return;
            }

            const stream = process.stdout;

            process.stderr?.on('data', (data) => {
                const message = data.toString();
                if (!message.includes('Broken pipe')) {
                    console.warn(`[yt-dlp stderr]: ${message}`);
                }
            });

            const onError = (error: Error) => {
                if (!process.killed) process.kill();
                stream.resume();
                reject(error);
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
            console.log(`[DEBUG] Buscando: ${url}`);

            try {
                // Intento 1: youtube-sr
                const result = await YouTube.searchOne(url);

                if (!result) {
                    console.log('[WARN] youtube-sr no encontró resultados, usando yt-dlp...');
                    throw new Error('youtube-sr failed');
                }

                videoUrl = result.url;
                title = result.title || 'Unknown Title';
                console.log(`[DEBUG] URL de video encontrada: ${videoUrl}`);
            } catch (error) {
                // Intento 2: Búsqueda con yt-dlp directamente (para Ubuntu Gnome)
                console.log('[INFO] Buscando con yt-dlp directamente...');

                const searchQuery = `ytsearch1:${url}`;
                const { stdout } = await execCommand(
                    `${ytDlpPath} --get-title --get-id "${searchQuery}"`,
                    { encoding: 'utf-8' }
                );

                const lines = stdout.trim().split('\n');
                if (lines.length >= 2) {
                    title = lines[0];
                    const videoId = lines[1];
                    videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                    console.log(`[DEBUG] Encontrado con yt-dlp: ${title} - ${videoUrl}`);
                } else {
                    throw new Error('No results found');
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
