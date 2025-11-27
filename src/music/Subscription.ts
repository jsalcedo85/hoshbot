import {
    AudioPlayer,
    AudioPlayerStatus,
    AudioResource,
    createAudioPlayer,
    entersState,
    VoiceConnection,
    VoiceConnectionDisconnectReason,
    VoiceConnectionStatus,
} from '@discordjs/voice';
import { Track } from './Track';
import { promisify } from 'util';

const wait = promisify(setTimeout);

/**
 * A MusicSubscription exists for each active VoiceConnection.
 * Each subscription has its own audio player and queue, and it also attaches logic to the audio player and voice connection for error handling and reconnection.
 */
export class MusicSubscription {
    public readonly voiceConnection: VoiceConnection;
    public readonly audioPlayer: AudioPlayer;
    public queue: Track[];
    public queueLock = false;
    public readyLock = false;
    private idleTimeout: NodeJS.Timeout | null = null;
    private aloneTimeout: NodeJS.Timeout | null = null;
    private readonly IDLE_TIME = 2 * 60 * 1000; // 2 minutos

    public constructor(voiceConnection: VoiceConnection) {
        this.voiceConnection = voiceConnection;
        this.audioPlayer = createAudioPlayer();
        this.queue = [];

        this.voiceConnection.on('stateChange', async (_, newState) => {
            if (newState.status === VoiceConnectionStatus.Disconnected) {
                if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
                    /**
                     * If the WebSocket closed with a 4014 code, this means that we should not manually attempt to reconnect,
                     * but there is a chance the connection will recover itself if the reason of the disconnect was due to
                     * switching voice channels. This is also the same code for the bot being kicked from the voice channel,
                     * so we allow 5 seconds to figure out which scenario it is. If the bot has been kicked, we should destroy
                     * the voice connection.
                     */
                    try {
                        await entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5_000);
                        // Probably moved voice channel
                    } catch {
                        this.voiceConnection.destroy();
                        // Probably kicked from voice channel
                    }
                } else if (this.voiceConnection.rejoinAttempts < 5) {
                    /**
                     * The disconnect in this case is recoverable, and we also have <5 repeated attempts so we will reconnect.
                     */
                    await wait((this.voiceConnection.rejoinAttempts + 1) * 5_000);
                    this.voiceConnection.rejoin();
                } else {
                    /**
                     * The disconnect in this case may be recoverable, but we have no more remaining attempts - destroy.
                     */
                    this.voiceConnection.destroy();
                }
            } else if (newState.status === VoiceConnectionStatus.Destroyed) {
                /**
                 * Once destroyed, stop the subscription.
                 */
                this.stop();
            } else if (
                !this.readyLock &&
                (newState.status === VoiceConnectionStatus.Connecting || newState.status === VoiceConnectionStatus.Signalling)
            ) {
                /**
                 * In the Signalling or Connecting states, we set a 20 second time limit for the connection to become ready
                 * before destroying the voice connection. This stops the voice connection permanently existing in one of these
                 * states.
                 */
                this.readyLock = true;
                try {
                    await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 20_000);
                } catch {
                    if (this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) this.voiceConnection.destroy();
                } finally {
                    this.readyLock = false;
                }
            }
        });

        // Configure audio player
        this.audioPlayer.on('stateChange', (oldState, newState) => {
            if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
                // If the Idle state is entered from a non-Idle state, it means that an audio resource has finished playing.
                // The queue is then processed to start playing the next track.
                (oldState.resource as AudioResource<Track>).metadata.onFinish();
                this.processQueue();
            } else if (newState.status === AudioPlayerStatus.Playing) {
                // Si el estado Playing se alcanzó, entonces una nueva pista ha comenzado a reproducirse.
                (newState.resource as AudioResource<Track>).metadata.onStart();

                // Cancelar timer de inactividad al reproducir
                this.clearIdleTimer();

                // Pre-cargar la siguiente pista en la cola para saltos instantáneos
                if (this.queue.length > 0) {
                    const nextTrack = this.queue[0];
                    nextTrack.preload();
                }

                // Verificar si el bot está solo
                this.checkIfAlone();
            }
        });

        this.audioPlayer.on('error', (error) => {
            (error.resource as AudioResource<Track>).metadata.onError(error);
        });

        voiceConnection.subscribe(this.audioPlayer);
    }

    /**
     * Agrega una nueva Pista a la cola.
     *
     * @param track La pista a agregar a la cola
     */
    public enqueue(track: Track) {
        this.clearIdleTimer(); // Cancelar timer de inactividad
        this.queue.push(track);
        this.processQueue();
    }

    /**
     * Detiene la reproducción de audio y vacía la cola.
     */
    public stop() {
        this.queueLock = true;
        this.queue = [];
        this.clearIdleTimer();
        if (this.aloneTimeout) {
            clearTimeout(this.aloneTimeout);
            this.aloneTimeout = null;
        }
        this.audioPlayer.stop(true);
    }

    /**
     * Intenta reproducir una Pista desde la cola.
     */
    private async processQueue(): Promise<void> {
        // Si la cola está bloqueada (ya procesando), o el reproductor ya está reproduciendo algo, retornar
        if (this.queueLock || this.audioPlayer.state.status !== AudioPlayerStatus.Idle || this.queue.length === 0) {
            // Si la cola está vacía y el player está Idle, iniciar timer de inactividad
            if (this.queue.length === 0 && this.audioPlayer.state.status === AudioPlayerStatus.Idle) {
                this.startIdleTimer();
            }
            return;
        }

        // Lock the queue to guarantee safe access
        this.queueLock = true;

        // Take the first item from the queue. This is guaranteed to exist due to the non-empty check above.
        const nextTrack = this.queue.shift()!;

        try {
            // Attempt to convert the Track into an AudioResource (i.e. start streaming the video)
            const resource = await nextTrack.createAudioResource();
            this.audioPlayer.play(resource);
            this.queueLock = false;
        } catch (error) {
            // If an error occurred, try the next item of the queue instead
            nextTrack.onError(error as Error);
            this.queueLock = false;
            return this.processQueue();
        }
    }

    /**
     * Cancela el timer de inactividad.
     */
    private clearIdleTimer(): void {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
            this.idleTimeout = null;
        }
    }

    /**
     * Inicia el timer de inactividad. Si no hay actividad por 2 minutos, desconecta el bot.
     */
    private startIdleTimer(): void {
        this.clearIdleTimer();

        this.idleTimeout = setTimeout(() => {
            console.log('[INFO] Desconectando por inactividad (2 minutos sin música)');
            this.voiceConnection.destroy();
        }, this.IDLE_TIME);
    }

    /**
     * Verifica si el bot está solo en el canal de voz y maneja la desconexión automática.
     */
    private checkIfAlone(): void {
        const channel = this.voiceConnection.joinConfig.channelId;
        if (!channel) return;

        // Limpiar timeout anterior
        if (this.aloneTimeout) {
            clearTimeout(this.aloneTimeout);
            this.aloneTimeout = null;
        }

        // Obtener información del canal desde el adaptador
        const guild = (this.voiceConnection as any).packets?.state?.guild_id;
        if (!guild) return;

        // Iniciar timer de soledad
        this.aloneTimeout = setTimeout(() => {
            console.log('[INFO] Desconectando porque el bot está solo en el canal de voz');
            this.voiceConnection.destroy();
        }, this.IDLE_TIME);
    }
}
