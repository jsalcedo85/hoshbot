import path from 'path';

export const CACHE_CONFIG = {
    cacheDir: path.join(process.cwd(), 'music-cache'),
    maxSizeGB: 50,
    metadataFile: 'metadata.json',
    tracksDir: 'tracks',
} as const;
