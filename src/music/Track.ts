import { AudioResource, createAudioResource, demuxProbe } from '@discordjs/voice';
import play from 'play-dl';

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

    private constructor({ url, title, onStart, onFinish, onError }: TrackData) {
        this.url = url;
        this.title = title;
        this.onStart = onStart;
        this.onFinish = onFinish;
        this.onError = onError;
    }

    /**
     * Creates an AudioResource from this Track.
     */
    public async createAudioResource(): Promise<AudioResource<Track>> {
        const stream = await play.stream(this.url);

        return createAudioResource(stream.stream, {
            inputType: stream.type,
            metadata: this,
        });
    }

    /**
     * Creates a Track from a video URL and lifecycle callbacks.
     */
    public static async from(url: string, methods: Pick<TrackData, 'onStart' | 'onFinish' | 'onError'>): Promise<Track> {
        const info = await play.video_basic_info(url);

        return new Track({
            title: info.video_details.title || 'Unknown Title',
            url,
            ...methods,
        });
    }
}
