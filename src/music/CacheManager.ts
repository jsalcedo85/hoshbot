import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
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
     * Download track as MP3 and save to cache
     */
    public async downloadTrack(videoUrl: string, title: string): Promise<string> {
        const hash = this.hashUrl(videoUrl);
        const filePath = path.join(this.tracksDir, `${hash}.mp3`);

        console.log(`[Cache] Downloading track: ${title}`);

        // Build yt-dlp arguments
        const args = [
            '-x', // Extract audio
            '--audio-format', 'mp3',
            '--audio-quality', '0', // Best quality
            '-o', filePath,
            '--no-playlist',
            '--no-check-certificate',
        ];

        // Add cookies if file exists
        try {
            await fs.access(cookiesPath);
            args.push('--cookies', cookiesPath);
        } catch {
            // cookies.txt doesn't exist, continue without it
        }

        args.push(videoUrl);

        return new Promise((resolve, reject) => {
            const process = spawn(ytDlpPath, args);

            let errorOutput = '';

            process.stderr?.on('data', (data) => {
                errorOutput += data.toString();
            });

            process.on('close', async (code) => {
                if (code === 0) {
                    try {
                        // Get file size
                        const stats = await fs.stat(filePath);

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

                        // Check and cleanup cache if needed
                        await this.cleanupCache();

                        resolve(filePath);
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    console.error(`[Cache] Download failed: ${errorOutput}`);
                    reject(new Error(`yt-dlp exited with code ${code}`));
                }
            });

            process.on('error', (error) => {
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
