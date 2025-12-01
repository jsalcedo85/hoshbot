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
import { cacheManager } from './CacheManager';
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

        this.voiceConnection.on('stateChange', async (oldState, newState) => {
            console.log(`[VoiceConnection] State change: ${oldState.status} -> ${newState.status}`);
            
            if (newState.status === VoiceConnectionStatus.Disconnected) {
                const closeCode = (newState as any).closeCode;
                console.log(`[VoiceConnection] Disconnected. Reason: ${newState.reason}, CloseCode: ${closeCode}`);
                if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && closeCode === 4014) {
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
                console.log(`[VoiceConnection] Connection destroyed`);
                /**
                 * Once destroyed, stop the subscription.
                 */
                this.stop();
                // Note: La limpieza del Map se debe hacer desde donde se creó la suscripción
            } else if (newState.status === VoiceConnectionStatus.Ready) {
                console.log(`[VoiceConnection] Connection ready`);
            } else if (
                !this.readyLock &&
                (newState.status === VoiceConnectionStatus.Connecting || newState.status === VoiceConnectionStatus.Signalling)
            ) {
                console.log(`[VoiceConnection] ${newState.status} - Setting ready lock`);
                /**
                 * In the Signalling or Connecting states, we set a 20 second time limit for the connection to become ready
                 * before destroying the voice connection. This stops the voice connection permanently existing in one of these
                 * states.
                 */
                this.readyLock = true;
                try {
                    await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 20_000);
                    console.log(`[VoiceConnection] Successfully entered Ready state`);
                } catch {
                    console.log(`[VoiceConnection] Failed to enter Ready state within timeout`);
                    if (this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) this.voiceConnection.destroy();
                } finally {
                    this.readyLock = false;
                }
            }
        });

        // Configure audio player
        this.audioPlayer.on('stateChange', (oldState, newState) => {
            console.log(`[AudioPlayer] State change: ${oldState.status} -> ${newState.status}`);
            
            if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
                console.log(`[AudioPlayer] Entered Idle state from ${oldState.status}`);
                
                // Check if resource ended prematurely
                if (oldState.status === AudioPlayerStatus.Playing) {
                    const track = (oldState.resource as AudioResource<Track>).metadata;
                    console.log(`[AudioPlayer] Track ended: ${track.title}`);
                    console.log(`[AudioPlayer] Resource ended unexpectedly - may indicate stream issue`);
                    
                    // Save track to cache after playback (if not already cached)
                    // Do this in background to avoid blocking
                    cacheManager.getCachedTrack(track.url).then((cachedPath) => {
                        if (!cachedPath) {
                            console.log(`[Cache] Saving track to cache after playback: ${track.title}`);
                            cacheManager.downloadTrack(track.url, track.title, true) // lowPriority=true
                                .then(() => {
                                    console.log(`[Cache] Successfully cached after playback: ${track.title}`);
                                })
                                .catch((error) => {
                                    console.warn(`[Cache] Failed to cache after playback: ${track.title}`, error.message);
                                });
                        }
                    }).catch(() => {
                        // If check fails, try to cache anyway
                        cacheManager.downloadTrack(track.url, track.title, true)
                            .catch(() => {});
                    });
                }
                
                // If the Idle state is entered from a non-Idle state, it means that an audio resource has finished playing.
                // The queue is then processed to start playing the next track.
                if (oldState.resource) {
                    (oldState.resource as AudioResource<Track>).metadata.onFinish();
                }
                this.processQueue();
            } else if (newState.status === AudioPlayerStatus.Playing) {
                const track = (newState.resource as AudioResource<Track>).metadata;
                const resource = newState.resource as AudioResource<Track>;
                console.log(`[AudioPlayer] Now Playing: ${track.title}`);
                console.log(`[AudioPlayer] Resource type: ${(resource as any).inputType || 'unknown'}`);
                // Si el estado Playing se alcanzó, entonces una nueva pista ha comenzado a reproducirse.
                track.onStart();

                // Cancelar timer de inactividad al reproducir
                this.clearIdleTimer();

                // Verificar si el bot está solo (pero no desconectar inmediatamente)
                this.checkIfAlone();
            } else if (newState.status === AudioPlayerStatus.Buffering) {
                console.log(`[AudioPlayer] Buffering audio...`);
                if (newState.resource) {
                    const track = (newState.resource as AudioResource<Track>).metadata;
                    console.log(`[AudioPlayer] Buffering track: ${track.title}`);
                }
            } else if (newState.status === AudioPlayerStatus.Paused) {
                console.log(`[AudioPlayer] Paused`);
            }
        });

        this.audioPlayer.on('error', (error) => {
            console.error(`[AudioPlayer] Error:`, error);
            if (error.resource) {
                (error.resource as AudioResource<Track>).metadata.onError(error);
            }
        });

        voiceConnection.subscribe(this.audioPlayer);
    }

    /**
     * Agrega una nueva Pista a la cola.
     *
     * @param track La pista a agregar a la cola
     */
    public enqueue(track: Track) {
        console.log(`[Queue] Enqueuing track: ${track.title}`);
        console.log(`[Queue] Current queue length: ${this.queue.length}`);
        this.clearIdleTimer(); // Cancelar timer de inactividad
        this.queue.push(track);
        console.log(`[Queue] New queue length: ${this.queue.length}`);

        // Preload track in background for faster playback next time
        // Only preload if not first track (first track streams immediately)
        if (this.queue.length > 1 || this.audioPlayer.state.status === AudioPlayerStatus.Playing) {
            console.log(`[Preload] Starting background download for: ${track.title}`);
            track.preload();
        }

        this.processQueue();
    }

    /**
     * Detiene la reproducción de audio y vacía la cola.
     */
    public stop() {
        console.log(`[Subscription] Stop called`);
        this.queueLock = true;
        this.queue = [];
        this.clearIdleTimer();
        if (this.aloneTimeout) {
            clearTimeout(this.aloneTimeout);
            this.aloneTimeout = null;
        }
        console.log(`[Subscription] Stopping audio player`);
        this.audioPlayer.stop(true);
    }

    /**
     * Intenta reproducir una Pista desde la cola.
     */
    private async processQueue(): Promise<void> {
        console.log(`[Queue] processQueue called. Lock: ${this.queueLock}, Player status: ${this.audioPlayer.state.status}, Queue length: ${this.queue.length}`);
        
        // Si la cola está bloqueada (ya procesando), o el reproductor ya está reproduciendo algo, retornar
        if (this.queueLock) {
            console.log(`[Queue] Queue is locked, skipping`);
            return;
        }
        
        if (this.audioPlayer.state.status !== AudioPlayerStatus.Idle) {
            console.log(`[Queue] Player is not idle (status: ${this.audioPlayer.state.status}), skipping`);
            return;
        }
        
        if (this.queue.length === 0) {
            console.log(`[Queue] Queue is empty, starting idle timer`);
            // Si la cola está vacía y el player está Idle, iniciar timer de inactividad
            if (this.audioPlayer.state.status === AudioPlayerStatus.Idle) {
                this.startIdleTimer();
            }
            return;
        }

        // Lock the queue to guarantee safe access
        this.queueLock = true;
        console.log(`[Queue] Lock acquired, processing queue`);

        // Take the first item from the queue. This is guaranteed to exist due to the non-empty check above.
        const nextTrack = this.queue.shift()!;
        console.log(`[Queue] Processing track: ${nextTrack.title}`);

        try {
            console.log(`[Queue] Creating audio resource for: ${nextTrack.title}`);
            // Attempt to convert the Track into an AudioResource (i.e. start streaming the video)
            // Set a timeout to prevent hanging
            const resourcePromise = nextTrack.createAudioResource();
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Timeout creating audio resource')), 30000); // 30 second timeout
            });

            const resource = await Promise.race([resourcePromise, timeoutPromise]);
            console.log(`[Queue] Audio resource created successfully for: ${nextTrack.title}`);
            console.log(`[Queue] Playing resource on audio player`);
            this.audioPlayer.play(resource);
            console.log(`[Queue] Resource played, unlocking queue`);
            this.queueLock = false;
        } catch (error) {
            // If an error occurred, try the next item of the queue instead
            console.error(`[Queue] Error playing track "${nextTrack.title}":`, error);
            nextTrack.onError(error as Error);
            this.queueLock = false;
            
            // Try next track if available
            if (this.queue.length > 0) {
                console.log(`[Queue] Trying next track in queue`);
                return this.processQueue();
            } else {
                console.log(`[Queue] No more tracks, stopping player`);
                // No more tracks, stop player
                this.audioPlayer.stop();
            }
        }
    }

    /**
     * Cancela el timer de inactividad.
     */
    private clearIdleTimer(): void {
        if (this.idleTimeout) {
            console.log(`[Timer] Clearing idle timer`);
            clearTimeout(this.idleTimeout);
            this.idleTimeout = null;
        }
    }

    /**
     * Inicia el timer de inactividad. Si no hay actividad por 2 minutos, desconecta el bot.
     */
    private startIdleTimer(): void {
        console.log(`[Timer] Starting idle timer (${this.IDLE_TIME / 1000} seconds)`);
        this.clearIdleTimer();

        this.idleTimeout = setTimeout(() => {
            console.log('[Timer] Idle timeout reached - Desconectando por inactividad (2 minutos sin música)');
            this.voiceConnection.destroy();
        }, this.IDLE_TIME);
    }

    /**
     * Verifica si el bot está solo en el canal de voz y maneja la desconexión automática.
     */
    private checkIfAlone(): void {
        const channelId = this.voiceConnection.joinConfig.channelId;
        if (!channelId) {
            console.log(`[AloneCheck] No channel ID found`);
            return;
        }

        console.log(`[AloneCheck] Checking if alone in channel ${channelId}`);

        // Limpiar timeout anterior
        if (this.aloneTimeout) {
            clearTimeout(this.aloneTimeout);
            this.aloneTimeout = null;
            console.log(`[AloneCheck] Cleared previous alone timeout`);
        }

        // Obtener el guild desde la conexión de voz
        const guildId = this.voiceConnection.joinConfig.guildId;
        if (!guildId) {
            console.log(`[AloneCheck] No guild ID found, skipping check`);
            return;
        }

        // Necesitamos acceder al cliente de Discord para obtener el canal
        // Por ahora, deshabilitamos la verificación de "solo" ya que requiere acceso al cliente
        // y puede causar falsos positivos. En su lugar, solo usamos el timer de inactividad.
        console.log(`[AloneCheck] Guild ID: ${guildId}, Channel ID: ${channelId}`);
        console.log(`[AloneCheck] Alone check disabled - using idle timer instead`);
        
        // NO iniciar timer de soledad - esto causaba desconexiones incorrectas
        // El timer de inactividad ya maneja la desconexión cuando no hay música
    }
}
