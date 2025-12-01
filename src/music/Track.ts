import { AudioResource, createAudioResource, demuxProbe } from '@discordjs/voice';
import { spawn } from 'child_process';
import YouTube from 'youtube-sr';
import path from 'path';
import { cacheManager } from './CacheManager';
import { createReadStream } from 'fs';
import { access } from 'fs/promises';

const ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp');
const cookiesPath = path.join(process.cwd(), 'cookies.txt');

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
     * Pre-loads the audio resource in the background by downloading to cache.
     * This doesn't block and allows immediate streaming playback.
     */
    public preload(): void {
        if (this.isPreloading) {
            return; // Already downloading
        }

        // Check if already cached
        cacheManager.getCachedTrack(this.url)
            .then(cachedPath => {
                if (cachedPath) {
                    console.log(`[Cache] Track already cached: ${this.title}`);
                    return;
                }

                // Start downloading in background
                this.isPreloading = true;
                console.log(`[Cache] Pre-cargando (descargando en background): ${this.title}`);

                cacheManager.downloadTrack(this.url, this.title)
                    .then(() => {
                        this.isPreloading = false;
                        console.log(`[Cache] Pre-carga completada: ${this.title}`);
                    })
                    .catch(error => {
                        this.isPreloading = false;
                        console.warn(`[Cache] Fallo en pre-carga para ${this.title}:`, error.message);
                    });
            })
            .catch(() => {
                // If check fails, try downloading anyway
                this.isPreloading = true;
                console.log(`[Cache] Pre-cargando (descargando en background): ${this.title}`);

                cacheManager.downloadTrack(this.url, this.title)
                    .then(() => {
                        this.isPreloading = false;
                        console.log(`[Cache] Pre-carga completada: ${this.title}`);
                    })
                    .catch(error => {
                        this.isPreloading = false;
                        console.warn(`[Cache] Fallo en pre-carga para ${this.title}:`, error.message);
                    });
            });
    }

    /**
     * Creates an AudioResource from this Track.
     * Uses streaming immediately if not cached, and downloads in background for future use.
     */
    public async createAudioResource(): Promise<AudioResource<Track>> {
        // Check if track exists in local cache
        const cachedPath = await cacheManager.getCachedTrack(this.url);

        if (cachedPath) {
            // Use cached file
            console.log(`[Cache] Playing from cache: ${this.title}`);
            return new Promise((resolve, reject) => {
                const stream = createReadStream(cachedPath);

                demuxProbe(stream)
                    .then((probe) => {
                        resolve(
                            createAudioResource(probe.stream, {
                                inputType: probe.type,
                                metadata: this,
                            }),
                        );
                    })
                    .catch(reject);
            });
        }

        // Track not in cache - use streaming immediately for instant playback
        console.log(`[Stream] Track not in cache, streaming immediately: ${this.title}`);

        // Start downloading in background for future use (don't wait for it)
        this.downloadInBackground();

        // Return streaming resource immediately
        return this.createStreamingResource();
    }

    /**
     * Downloads track in background without blocking playback.
     */
    private downloadInBackground(): void {
        if (this.isPreloading) {
            return; // Already downloading
        }

        this.isPreloading = true;
        console.log(`[Cache] Iniciando descarga en background: ${this.title}`);

        cacheManager.downloadTrack(this.url, this.title)
            .then(() => {
                this.isPreloading = false;
                console.log(`[Cache] Descarga en background completada: ${this.title}`);
            })
            .catch(error => {
                this.isPreloading = false;
                console.warn(`[Cache] Fallo en descarga en background para ${this.title}:`, error.message);
            });
    }

    /**
     * Creates a streaming audio resource (fallback method)
     */
    private async createStreamingResource(): Promise<AudioResource<Track>> {
        console.log(`[DEBUG] Streaming audio para URL: ${this.url}`);

        // Build yt-dlp arguments
        const args = [
            '-f', 'bestaudio[ext=webm]/bestaudio',
            '-o', '-',
            '-q',
            '--no-warnings',
            '--no-playlist',
            '--no-check-certificate',
            '--prefer-free-formats',
            '--buffer-size', '16K',
        ];

        // Add cookies if file exists
        try {
            await access(cookiesPath);
            args.push('--cookies', cookiesPath);
        } catch {
            // cookies.txt doesn't exist, continue without it
        }

        args.push(this.url);

        return new Promise((resolve, reject) => {
            const process = spawn(ytDlpPath, args, {
                stdio: ['ignore', 'pipe', 'pipe']
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

        if (!url.startsWith('http')) {
            console.log(`[DEBUG] Buscando: ${url}`);
            const searchResults = await YouTube.searchOne(url);
            if (!searchResults) {
                throw new Error('No results found');
            }
            videoUrl = searchResults.url;
            title = searchResults.title || 'Unknown Title';
            console.log(`[DEBUG] URL de video encontrada: ${videoUrl}`);
        } else {
            try {
                const video = await YouTube.getVideo(url);
                title = video.title || 'Unknown Title';
            } catch (e) {
                console.warn('Failed to fetch video details:', e);
            }
        }

        return new Track({
            title,
            url: videoUrl,
            ...methods,
        });
    }
}
