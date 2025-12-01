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
        // Check if track exists in local cache (fast path)
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
                    .catch((error) => {
                        console.error(`[Cache] Failed to read cached file, falling back to streaming: ${error.message}`);
                        // Fallback to streaming if cached file is corrupted
                        this.downloadInBackground();
                        this.createStreamingResource().then(resolve).catch(reject);
                    });
            });
        }

        // Track not in cache - use streaming immediately for instant playback
        console.log(`[Stream] Track not in cache, streaming immediately: ${this.title}`);

        // Start downloading in background for future use (don't wait for it)
        this.downloadInBackground();

        // Return streaming resource immediately with error handling
        try {
            return await this.createStreamingResource();
        } catch (error: any) {
            console.error(`[Stream] Streaming failed: ${error.message}`);
            // If streaming fails completely, throw error (will be handled by Subscription)
            throw new Error(`Failed to stream track: ${error.message}`);
        }
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
     * Creates a streaming audio resource with multiple format fallbacks.
     * Tries multiple formats to ensure compatibility with all videos.
     */
    private async createStreamingResource(): Promise<AudioResource<Track>> {
        console.log(`[Stream] Streaming audio para URL: ${this.url}`);

        // Multiple format selectors with fallbacks (most compatible first)
        // Format: bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best[height<=480]
        const formatSelectors = [
            'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best[height<=480]', // Best quality audio, fallback to video if needed
            'bestaudio/best[height<=480]', // Any audio format, fallback to low-res video
            'best[height<=480]/worst', // Any format available
        ];

        // Check cookies once
        const hasCookies = await this.checkCookies();

        // Try each format selector until one works
        for (let i = 0; i < formatSelectors.length; i++) {
            try {
                return await this.tryStreamingFormat(formatSelectors[i], hasCookies);
            } catch (error: any) {
                const isLastAttempt = i === formatSelectors.length - 1;
                if (isLastAttempt) {
                    console.error(`[Stream] All format attempts failed for: ${this.title}`);
                    throw new Error(`No compatible format found: ${error.message}`);
                }
                console.warn(`[Stream] Format attempt ${i + 1} failed, trying next...`);
            }
        }

        throw new Error('Failed to create streaming resource');
    }

    /**
     * Checks if cookies file exists (cached check)
     */
    private cookiesChecked: boolean | null = null;
    private async checkCookies(): Promise<boolean> {
        if (this.cookiesChecked !== null) {
            return this.cookiesChecked;
        }
        try {
            await access(cookiesPath);
            this.cookiesChecked = true;
            return true;
        } catch {
            this.cookiesChecked = false;
            return false;
        }
    }

    /**
     * Attempts to stream with a specific format selector
     */
    private async tryStreamingFormat(formatSelector: string, hasCookies: boolean): Promise<AudioResource<Track>> {
        return new Promise((resolve, reject) => {
            // Build yt-dlp arguments optimized for speed
            const args = [
                '-f', formatSelector,
                '-o', '-',
                '--no-playlist',
                '--no-warnings',
                '--no-check-certificate',
                '--prefer-free-formats',
                '--buffer-size', '64K', // Increased buffer for better performance
                '--http-chunk-size', '10M', // Larger chunks for faster streaming
            ];

            if (hasCookies) {
                args.push('--cookies', cookiesPath);
            }

            args.push(this.url);

            const process = spawn(ytDlpPath, args, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            if (!process.stdout) {
                reject(new Error('No stdout from yt-dlp process'));
                return;
            }

            const stream = process.stdout;
            let errorOutput = '';
            let hasStarted = false;
            const timeout = setTimeout(() => {
                if (!hasStarted) {
                    if (!process.killed) process.kill();
                    reject(new Error('Stream timeout - format may not be available'));
                }
            }, 15000); // 15 second timeout

            process.stderr?.on('data', (data) => {
                const message = data.toString();
                errorOutput += message;
                
                // Check for format-related errors
                if (message.includes('requested format is not available') || 
                    message.includes('format not available') ||
                    message.includes('No video formats found')) {
                    if (!process.killed) process.kill();
                    clearTimeout(timeout);
                    reject(new Error(`Format not available: ${formatSelector}`));
                    return;
                }
                
                // Ignore common non-critical messages
                if (!message.includes('Broken pipe') && 
                    !message.includes('WARNING') && 
                    !message.includes('ERROR')) {
                    // Only log actual errors
                }
            });

            const onError = (error: Error) => {
                clearTimeout(timeout);
                if (!process.killed) process.kill();
                stream.resume();
                reject(error);
            };

            process.once('spawn', () => {
                hasStarted = true;
                clearTimeout(timeout);
                
                demuxProbe(stream)
                    .then((probe) => {
                        resolve(
                            createAudioResource(probe.stream, {
                                inputType: probe.type,
                                metadata: this,
                            }),
                        );
                    })
                    .catch((error) => {
                        // If probe fails, it might be a format issue
                        reject(new Error(`Failed to probe stream: ${error.message}`));
                    });
            });

            process.on('error', onError);
            
            process.on('close', (code) => {
                if (code !== 0 && code !== null && !hasStarted) {
                    clearTimeout(timeout);
                    reject(new Error(`yt-dlp exited with code ${code}: ${errorOutput.substring(0, 200)}`));
                }
            });
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
