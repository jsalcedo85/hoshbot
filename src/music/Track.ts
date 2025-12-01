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

    private constructor({ url, title, onStart, onFinish, onError }: TrackData) {
        this.url = url;
        this.title = title;
        this.onStart = onStart;
        this.onFinish = onFinish;
        this.onError = onError;
    }

    /**
     * Pre-loads track by downloading it to cache in the background.
     * This allows subsequent plays to use cached file for instant playback.
     */
    public preload(): void {
        // Download track to cache in background (non-blocking, low priority)
        // Use lowPriority=true to avoid interfering with current playback
        cacheManager.downloadTrack(this.url, this.title, true)
            .then((filePath) => {
                console.log(`[Preload] Successfully cached: ${this.title}`);
            })
            .catch((error) => {
                console.warn(`[Preload] Failed to cache ${this.title}: ${error.message}`);
                // Don't throw - preload failures shouldn't break playback
            });
    }

    /**
     * Creates an AudioResource from this Track.
     * Uses streaming only for instant playback.
     */
    public async createAudioResource(): Promise<AudioResource<Track>> {
        console.log(`[Track] createAudioResource called for: ${this.title}`);
        console.log(`[Track] URL: ${this.url}`);
        
        // Check if track exists in local cache (fast path)
        console.log(`[Track] Checking cache for: ${this.url}`);
        const cachedPath = await cacheManager.getCachedTrack(this.url);

        if (cachedPath) {
            // Use cached file if available
            console.log(`[Cache] Playing from cache: ${this.title}`);
            return new Promise((resolve, reject) => {
                console.log(`[Cache] Creating read stream from: ${cachedPath}`);
                const stream = createReadStream(cachedPath);

                demuxProbe(stream)
                    .then((probe) => {
                        console.log(`[Cache] Probe successful, type: ${probe.type}`);
                        const resource = createAudioResource(probe.stream, {
                            inputType: probe.type,
                            metadata: this,
                        });
                        console.log(`[Cache] Audio resource created from cache`);
                        resolve(resource);
                    })
                    .catch((error) => {
                        console.error(`[Cache] Failed to read cached file, falling back to streaming: ${error.message}`);
                        // Fallback to streaming if cached file is corrupted
                        this.createStreamingResource().then(resolve).catch(reject);
                    });
            });
        }

        // Streaming-only mode - use streaming immediately for instant playback
        console.log(`[Stream] Track not in cache, streaming: ${this.title}`);

        // Return streaming resource immediately with error handling
        try {
            console.log(`[Stream] Calling createStreamingResource for: ${this.title}`);
            const resource = await this.createStreamingResource();
            console.log(`[Stream] Streaming resource created successfully for: ${this.title}`);
            return resource;
        } catch (error: any) {
            console.error(`[Stream] Streaming failed for ${this.title}: ${error.message}`);
            console.error(`[Stream] Error stack:`, error.stack);
            // If streaming fails completely, throw error (will be handled by Subscription)
            throw new Error(`Failed to stream track: ${error.message}`);
        }
    }

    /**
     * Creates a streaming audio resource with best quality format selector.
     * Prioritizes high quality audio formats (m4a, webm) before falling back.
     */
    private async createStreamingResource(): Promise<AudioResource<Track>> {
        console.log(`[Stream] Streaming audio para URL: ${this.url}`);

        // Best quality format selector: prefer m4a (usually highest quality), then webm, then any audio, then video
        const formatSelector = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best';

        // Check cookies once
        const hasCookies = await this.checkCookies();

        // Try streaming with simple format
        try {
            return await this.tryStreamingFormat(formatSelector, hasCookies);
        } catch (error: any) {
            console.error(`[Stream] Streaming failed for: ${this.title}`, error.message);
            throw new Error(`Failed to stream track: ${error.message}`);
        }
    }

    /**
     * Checks if cookies file exists and has content (cached check)
     */
    private cookiesChecked: boolean | null = null;
    private async checkCookies(): Promise<boolean> {
        if (this.cookiesChecked !== null) {
            return this.cookiesChecked;
        }
        try {
            await access(cookiesPath);
            const fs = require('fs');
            const stats = fs.statSync(cookiesPath);
            const hasContent = stats.size > 0;
            this.cookiesChecked = hasContent;
            console.log(`[Cookies] File exists: true, Has content: ${hasContent}, Size: ${stats.size} bytes`);
            return hasContent;
        } catch (error: any) {
            this.cookiesChecked = false;
            console.log(`[Cookies] File check failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Attempts to stream with a specific format selector
     */
    private async tryStreamingFormat(formatSelector: string, hasCookies: boolean): Promise<AudioResource<Track>> {
        return new Promise((resolve, reject) => {
            let resourceCreated = false;
            console.log(`[Stream] Building yt-dlp arguments for format: ${formatSelector}`);
            // Build yt-dlp arguments - simple and compatible
            const args = [
                '-f', formatSelector,
                '-o', '-',
                '--no-playlist',
                '--no-warnings',
                '--quiet', // Suppress all output
                '--no-progress', // Disable progress bar
            ];

            if (hasCookies) {
                console.log(`[Stream] Adding cookies: ${cookiesPath}`);
                args.push('--cookies', cookiesPath);
            } else {
                console.log(`[Stream] No cookies file found, proceeding without cookies`);
            }

            args.push(this.url);
            console.log(`[Stream] yt-dlp command: ${ytDlpPath} ${args.join(' ')}`);

            // Spawn process with stderr piped to detect critical errors but suppress progress logs
            const process = spawn(ytDlpPath, args, {
                stdio: ['ignore', 'pipe', 'pipe'] // stdin: ignore, stdout: pipe (for audio), stderr: pipe (for error detection)
            });

            console.log(`[Stream] Spawning yt-dlp process (PID: ${process.pid})`);

            if (!process.stdout) {
                console.error(`[Stream] No stdout available from yt-dlp process`);
                reject(new Error('No stdout from yt-dlp process'));
                return;
            }

            const stream = process.stdout;
            let errorOutput = '';
            let hasStarted = false;
            let authenticationError = false;
            const timeout = setTimeout(() => {
                if (!hasStarted) {
                    console.error(`[Stream] Timeout waiting for stream to start`);
                    if (!process.killed) {
                        console.log(`[Stream] Killing yt-dlp process due to timeout`);
                        process.kill();
                    }
                    reject(new Error('Stream timeout - format may not be available'));
                }
            }, 15000); // 15 second timeout

            // Process stderr to detect critical errors but suppress [download] progress logs
            process.stderr?.on('data', (data) => {
                const message = data.toString();
                errorOutput += message;
                
                // Suppress [download] progress lines completely
                const lines = message.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    
                    // Skip download progress lines completely
                    if (trimmedLine.startsWith('[download]')) {
                        hasStarted = true;
                        continue; // Don't log download progress
                    }
                    
                    // Only process critical errors (authentication, format errors)
                    if (trimmedLine.includes('Sign in to confirm') || trimmedLine.includes('confirm you\'re not a bot')) {
                        console.error(`[Stream] YouTube authentication error detected`);
                        console.error(`[Stream] Cookies may be invalid or expired`);
                        authenticationError = true;
                        if (!process.killed && !resourceCreated) {
                            console.error(`[Stream] Rejecting stream due to authentication error`);
                            process.kill();
                            clearTimeout(timeout);
                            reject(new Error('YouTube authentication failed. Please update cookies.txt with valid cookies.'));
                        }
                        return;
                    }
                    
                    // Check for format-related errors
                    if (trimmedLine.includes('requested format is not available') || 
                        trimmedLine.includes('format not available') ||
                        trimmedLine.includes('No video formats found')) {
                        console.error(`[Stream] Format not available error detected`);
                        if (!process.killed && !resourceCreated) {
                            process.kill();
                            clearTimeout(timeout);
                            reject(new Error(`Format not available: ${formatSelector}`));
                        }
                        return;
                    }
                    
                    // Log other errors (but not progress)
                    if (trimmedLine.includes('ERROR') && !trimmedLine.includes('WARNING') && !trimmedLine.startsWith('[download]')) {
                        console.error(`[Stream] yt-dlp ERROR: ${trimmedLine.substring(0, 300)}`);
                    }
                }
            });

            const onError = (error: Error) => {
                console.error(`[Stream] Process error: ${error.message}`);
                console.error(`[Stream] Process error stack:`, error.stack);
                clearTimeout(timeout);
                if (!process.killed) process.kill();
                stream.resume();
                reject(error);
            };

            process.once('spawn', () => {
                console.log(`[Stream] yt-dlp process spawned successfully for: ${this.title}`);
                hasStarted = true;
                clearTimeout(timeout);
                
                // Wait a bit to check for immediate errors before probing
                setTimeout(() => {
                    if (authenticationError) {
                        console.error(`[Stream] Authentication error detected before probe, aborting`);
                        return; // Already rejected in stderr handler
                    }
                    
                    console.log(`[Stream] Starting demuxProbe on stream...`);
                    demuxProbe(stream)
                        .then((probe) => {
                            if (authenticationError) {
                                console.error(`[Stream] Authentication error detected during probe, aborting`);
                                reject(new Error('YouTube authentication failed. Please update cookies.txt with valid cookies.'));
                                return;
                            }
                            
                            console.log(`[Stream] Probe successful! Type: ${probe.type}`);
                            const resource = createAudioResource(probe.stream, {
                                inputType: probe.type,
                                metadata: this,
                            });
                            resourceCreated = true;
                            console.log(`[Stream] Audio resource created successfully from stream for: ${this.title}`);
                            console.log(`[Stream] Resource stream is readable: ${probe.stream.readable}`);
                            resolve(resource);
                        })
                        .catch((error) => {
                            console.error(`[Stream] Probe failed for ${this.title}: ${error.message}`);
                            console.error(`[Stream] Probe error stack:`, error.stack);
                            // If probe fails, it might be a format issue
                            reject(new Error(`Failed to probe stream: ${error.message}`));
                        });
                }, 500); // Wait 500ms to catch authentication errors
            });

            process.on('error', onError);
            
            process.on('close', (code) => {
                console.log(`[Stream] yt-dlp process closed with code: ${code}`);
                if (code !== 0 && code !== null) {
                    if (!hasStarted) {
                        console.error(`[Stream] Process exited with error code ${code} before stream started`);
                        console.error(`[Stream] Error output: ${errorOutput.substring(0, 500)}`);
                        clearTimeout(timeout);
                        if (!resourceCreated) {
                            reject(new Error(`yt-dlp exited with code ${code}: ${errorOutput.substring(0, 200)}`));
                        }
                    } else if (!resourceCreated) {
                        // Stream started but resource wasn't created yet
                        console.warn(`[Stream] Process exited with code ${code} but resource was being created`);
                        console.warn(`[Stream] Error output: ${errorOutput.substring(0, 500)}`);
                    } else {
                        // Resource was created, process exit is normal (stream ended)
                        console.log(`[Stream] Process exited normally after resource creation (code: ${code})`);
                    }
                } else if (code === 0) {
                    console.log(`[Stream] yt-dlp process exited successfully`);
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
