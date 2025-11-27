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

// Helper to wrap logic for creating a Track from a video URL
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
        console.log(`[DEBUG] Pre-loading audio resource for: ${this.title}`);

        this.createAudioResource()
            .then(resource => {
                this.cachedResource = resource;
                this.isPreloading = false;
                console.log(`[DEBUG] Pre-loaded successfully: ${this.title}`);
            })
            .catch(error => {
                this.isPreloading = false;
                console.warn(`[DEBUG] Pre-load failed for ${this.title}:`, error.message);
            });
    }

    /**
     * Creates an AudioResource from this Track.
     */
    public async createAudioResource(): Promise<AudioResource<Track>> {
        // If we have a cached resource, return it immediately
        if (this.cachedResource) {
            console.log(`[DEBUG] Using cached audio resource for: ${this.title}`);
            const resource = this.cachedResource;
            this.cachedResource = null; // Clear cache after use
            return resource;
        }

        console.log(`[DEBUG] Creating audio resource for URL: ${this.url}`);

        return new Promise((resolve, reject) => {
            const process = spawn(ytDlpPath, [
                '-f', 'bestaudio[ext=webm]/bestaudio',
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

        if (!url.startsWith('http')) {
            console.log(`[DEBUG] Searching for: ${url}`);
            const searchResults = await YouTube.searchOne(url);
            if (!searchResults) {
                throw new Error('No results found');
            }
            videoUrl = searchResults.url;
            title = searchResults.title || 'Unknown Title';
            console.log(`[DEBUG] Found video URL: ${videoUrl}`);
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
