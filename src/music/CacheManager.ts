import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import process from 'process';
import { CACHE_CONFIG } from '../config/cache.config';

const ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp');
const cookiesPath = path.join(process.cwd(), 'cookies.txt');

interface TrackMetadata {
    hash: string;
    videoUrl: string;
    title: string;
    downloadedAt: number;
    lastAccessedAt: number;
    filePath: string;
    fileSizeBytes: number;
}

interface MetadataDatabase {
    tracks: { [hash: string]: TrackMetadata };
}

export class CacheManager {
    private metadataPath: string;
    private tracksDir: string;

    constructor() {
        this.metadataPath = path.join(CACHE_CONFIG.cacheDir, CACHE_CONFIG.metadataFile);
        this.tracksDir = path.join(CACHE_CONFIG.cacheDir, CACHE_CONFIG.tracksDir);
    }

    /**
     * Initialize cache directory structure
     */
    public async initialize(): Promise<void> {
        try {
            await fs.mkdir(CACHE_CONFIG.cacheDir, { recursive: true });
            await fs.mkdir(this.tracksDir, { recursive: true });

            // Create metadata file if it doesn't exist
            try {
                await fs.access(this.metadataPath);
            } catch {
                await this.saveMetadata({ tracks: {} });
            }

            console.log('[Cache] Cache manager initialized');
        } catch (error) {
            console.error('[Cache] Failed to initialize cache:', error);
            throw error;
        }
    }

    /**
     * Generate hash from video URL
     */
    private hashUrl(url: string): string {
        return createHash('md5').update(url).digest('hex');
    }

    /**
     * Load metadata database
     */
    private async loadMetadata(): Promise<MetadataDatabase> {
        try {
            const data = await fs.readFile(this.metadataPath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return { tracks: {} };
        }
    }

    /**
     * Save metadata database
     */
    private async saveMetadata(metadata: MetadataDatabase): Promise<void> {
        await fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }

    /**
     * Check if track exists in cache
     */
    public async getCachedTrack(videoUrl: string): Promise<string | null> {
        const hash = this.hashUrl(videoUrl);
        const metadata = await this.loadMetadata();
        const track = metadata.tracks[hash];

        if (!track) {
            return null;
        }

        // Verify file actually exists
        try {
            await fs.access(track.filePath);
            await this.updateLastAccess(hash);
            console.log(`[Cache] Track found in cache: ${track.title}`);
            return track.filePath;
        } catch {
            // File doesn't exist, remove from metadata
            delete metadata.tracks[hash];
            await this.saveMetadata(metadata);
            return null;
        }
    }

    /**
     * Download track with multiple format fallbacks and save to cache
     */
    public async downloadTrack(videoUrl: string, title: string): Promise<string> {
        const hash = this.hashUrl(videoUrl);
        const filePath = path.join(this.tracksDir, `${hash}.mp3`);

        console.log(`[Cache] Downloading track: ${title}`);

        // Check cookies once
        const hasCookies = await this.checkCookies();

        // Try multiple audio format options with fallbacks
        const formatOptions = [
            // Option 1: Extract audio to MP3 (best quality)
            { extract: true, format: 'mp3', quality: '0' },
            // Option 2: Extract audio to MP3 (any quality)
            { extract: true, format: 'mp3', quality: '5' },
            // Option 3: Extract audio to any format, convert to MP3
            { extract: true, format: 'best', quality: '0' },
            // Option 4: Download best audio and let ffmpeg handle conversion
            { extract: true, format: 'bestaudio', quality: '0' },
        ];

        for (let i = 0; i < formatOptions.length; i++) {
            try {
                return await this.tryDownloadFormat(videoUrl, title, hash, filePath, formatOptions[i], hasCookies);
            } catch (error: any) {
                const isLastAttempt = i === formatOptions.length - 1;
                if (isLastAttempt) {
                    console.error(`[Cache] All download format attempts failed for: ${title}`);
                    throw new Error(`Failed to download: ${error.message}`);
                }
                console.warn(`[Cache] Download format attempt ${i + 1} failed, trying next...`);
            }
        }

        throw new Error('Failed to download track with any available format');
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
            await fs.access(cookiesPath);
            this.cookiesChecked = true;
            return true;
        } catch {
            this.cookiesChecked = false;
            return false;
        }
    }

    /**
     * Attempts to download with a specific format configuration
     */
    private async tryDownloadFormat(
        videoUrl: string,
        title: string,
        hash: string,
        filePath: string,
        formatOption: { extract: boolean; format: string; quality: string },
        hasCookies: boolean
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            // Build yt-dlp arguments optimized for download speed
            const args = [
                '-o', filePath,
                '--no-playlist',
                '--no-check-certificate',
                '--no-warnings',
            ];

            if (formatOption.extract) {
                args.push('-x'); // Extract audio
                args.push('--audio-format', formatOption.format);
                args.push('--audio-quality', formatOption.quality);
            } else {
                args.push('-f', formatOption.format);
            }

            // Optimize for speed
            args.push('--concurrent-fragments', '4'); // Download fragments concurrently
            args.push('--http-chunk-size', '10M'); // Larger chunks
            
            // Configure progress output to single line
            args.push('--progress-template', '[download] %(progress.downloaded_bytes)s/%(progress.total_bytes)s (%(progress._percent_str)s) @ %(progress.speed)s ETA %(progress._eta_str)s');
            args.push('--newline'); // Use newline for progress updates

            if (hasCookies) {
                args.push('--cookies', cookiesPath);
            }

            args.push(videoUrl);

            const process = spawn(ytDlpPath, args);

            let errorOutput = '';
            let hasStarted = false;
            let lastProgressLine = '';
            const timeout = setTimeout(() => {
                if (!hasStarted) {
                    if (!process.killed) process.kill();
                    reject(new Error('Download timeout'));
                }
            }, 300000); // 5 minute timeout for downloads

            process.stderr?.on('data', (data) => {
                const message = data.toString();
                errorOutput += message;
                
                // Process progress lines - show only the latest one
                const lines = message.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('[download]')) {
                        // Update progress line (overwrite previous using \r)
                        stdoutWrite(`\r[Cache] ${trimmedLine}`);
                        lastProgressLine = trimmedLine;
                        hasStarted = true;
                    } else if (trimmedLine && !trimmedLine.startsWith('[download]')) {
                        // Other messages (errors, warnings, etc.)
                        if (trimmedLine.includes('requested format is not available') || 
                            trimmedLine.includes('format not available') ||
                            trimmedLine.includes('No video formats found') ||
                            trimmedLine.includes('ERROR')) {
                            // Don't kill immediately, let it try to complete
                            if (trimmedLine.includes('ERROR') && !trimmedLine.includes('WARNING')) {
                                stdoutWrite('\n'); // New line before error
                                console.warn(`[Cache] Error during download: ${trimmedLine.substring(0, 200)}`);
                            }
                        }
                    }
                }
            });

            process.stdout?.on('data', () => {
                hasStarted = true;
            });

            process.on('close', async (code) => {
                clearTimeout(timeout);
                
                // Clear progress line and add newline
                if (lastProgressLine) {
                    stdoutWrite('\r' + ' '.repeat(100) + '\r');
                }
                
                if (code === 0) {
                    try {
                        // Verify file exists and has content
                        const stats = await fs.stat(filePath);
                        if (stats.size === 0) {
                            reject(new Error('Downloaded file is empty'));
                            return;
                        }

                        // Save metadata
                        const metadata = await this.loadMetadata();
                        const now = Date.now();
                        metadata.tracks[hash] = {
                            hash,
                            videoUrl,
                            title,
                            downloadedAt: now,
                            lastAccessedAt: now,
                            filePath,
                            fileSizeBytes: stats.size,
                        };
                        await this.saveMetadata(metadata);

                        console.log(`[Cache] Download complete: ${title} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

                        // Check and cleanup cache if needed (don't wait)
                        this.cleanupCache().catch(err => console.warn('[Cache] Cleanup error:', err));

                        resolve(filePath);
                    } catch (error: any) {
                        reject(new Error(`Failed to save metadata: ${error.message}`));
                    }
                } else {
                    // Check if it's a format error
                    if (errorOutput.includes('format not available') || 
                        errorOutput.includes('requested format is not available')) {
                        reject(new Error(`Format not available: ${formatOption.format}`));
                    } else {
                        reject(new Error(`yt-dlp exited with code ${code}: ${errorOutput.substring(0, 300)}`));
                    }
                }
            });

            process.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Update last access time for a track
     */
    private async updateLastAccess(hash: string): Promise<void> {
        const metadata = await this.loadMetadata();
        if (metadata.tracks[hash]) {
            metadata.tracks[hash].lastAccessedAt = Date.now();
            await this.saveMetadata(metadata);
        }
    }

    /**
     * Calculate total cache size in bytes
     */
    public async getCacheSize(): Promise<number> {
        const metadata = await this.loadMetadata();
        let totalSize = 0;

        for (const track of Object.values(metadata.tracks)) {
            totalSize += track.fileSizeBytes;
        }

        return totalSize;
    }

    /**
     * Cleanup old tracks when cache exceeds size limit
     */
    public async cleanupCache(): Promise<void> {
        const maxSizeBytes = CACHE_CONFIG.maxSizeGB * 1024 * 1024 * 1024;
        const currentSize = await this.getCacheSize();

        console.log(`[Cache] Cache size: ${(currentSize / 1024 / 1024 / 1024).toFixed(2)} GB / ${CACHE_CONFIG.maxSizeGB} GB`);

        if (currentSize <= maxSizeBytes) {
            return;
        }

        console.log('[Cache] Cache size exceeded, cleaning up old tracks...');

        const metadata = await this.loadMetadata();
        const tracks = Object.values(metadata.tracks);

        // Sort by last accessed time (oldest first)
        tracks.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

        let sizeToFree = currentSize - maxSizeBytes;
        let freedSize = 0;

        for (const track of tracks) {
            if (freedSize >= sizeToFree) {
                break;
            }

            try {
                await fs.unlink(track.filePath);
                freedSize += track.fileSizeBytes;
                delete metadata.tracks[track.hash];
                console.log(`[Cache] Deleted old track: ${track.title} (${(track.fileSizeBytes / 1024 / 1024).toFixed(2)} MB)`);
            } catch (error) {
                console.warn(`[Cache] Failed to delete track: ${track.title}`, error);
            }
        }

        await this.saveMetadata(metadata);
        console.log(`[Cache] Cleanup complete. Freed ${(freedSize / 1024 / 1024).toFixed(2)} MB`);
    }

    /**
     * Get cache statistics
     */
    public async getStats(): Promise<{ totalTracks: number; totalSizeGB: number; tracksInfo: TrackMetadata[] }> {
        const metadata = await this.loadMetadata();
        const tracks = Object.values(metadata.tracks);
        const totalSize = await this.getCacheSize();

        return {
            totalTracks: tracks.length,
            totalSizeGB: totalSize / 1024 / 1024 / 1024,
            tracksInfo: tracks.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt),
        };
    }
}

// Singleton instance
export const cacheManager = new CacheManager();
