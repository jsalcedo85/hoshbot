import { Events, Message } from 'discord.js';
import { BotClient } from '../structures/BotClient';
import { Logger } from '../utils/logger';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { Track } from '../music/Track';
import { MusicSubscription } from '../music/Subscription';
import { AudioPlayerStatus, AudioResource } from '@discordjs/voice';

const PREFIX = 'h!';

module.exports = {
    name: Events.MessageCreate,
    async execute(message: Message, client: BotClient) {
        // Ignore bots and messages without prefix
        if (message.author.bot || !message.content.startsWith(PREFIX)) {
            return;
        }

        // Parse command
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const commandName = args.shift()?.toLowerCase();

        if (!commandName) {
            return;
        }

        // Get subscription
        let subscription = client.subscriptions.get(message.guildId!);

        try {
            switch (commandName) {
                case 'play':
                    if (!args.length) {
                        await message.reply('❌ Por favor proporciona una canción o URL');
                        return;
                    }

                    const query = args.join(' ');

                    // Create subscription if needed
                    if (!subscription) {
                        if (message.member && 'voice' in message.member && message.member.voice.channel) {
                            const channel = message.member.voice.channel;
                            const connection = joinVoiceChannel({
                                channelId: channel.id,
                                guildId: channel.guild.id,
                                adapterCreator: channel.guild.voiceAdapterCreator as any,
                            });

                            subscription = new MusicSubscription(connection);
                            subscription.voiceConnection.on('error', (error) => {
                                Logger.error(`[VoiceConnection] Error:`, error);
                            });

                            subscription.voiceConnection.on('stateChange', (oldState, newState) => {
                                if (newState.status === VoiceConnectionStatus.Destroyed) {
                                    Logger.log(`[Play] Connection destroyed, removing subscription for guild ${message.guildId}`);
                                    client.subscriptions.delete(message.guildId!);
                                }
                            });

                            client.subscriptions.set(message.guildId!, subscription);
                        }
                    }

                    if (!subscription) {
                        await message.reply('❌ ¡Únete a un canal de voz e intenta de nuevo!');
                        return;
                    }

                    // Ensure connection is ready
                    try {
                        await entersState(subscription.voiceConnection, VoiceConnectionStatus.Ready, 20_000);
                    } catch (error) {
                        Logger.warn(error);
                        await message.reply('❌ ¡No se pudo conectar al canal de voz en 20 segundos, intenta más tarde!');
                        return;
                    }

                    // Create track
                    const track = await Track.from(query, {
                        onStart() {
                            message.channel.send(`🎵 **Ahora reproduciendo:** ${track.title}`).catch(Logger.warn);
                        },
                        onFinish() {
                            // No-op
                        },
                        onError(error) {
                            Logger.warn(error);
                            message.channel.send(`❌ Error: ${error.message}`).catch(Logger.warn);
                        },
                    });

                    subscription.enqueue(track);
                    await message.reply(`✅ Añadido a la cola: **${track.title}**`);
                    break;

                case 'pause':
                    if (subscription) {
                        subscription.audioPlayer.pause();
                        await message.reply('⏸️ ¡Pausado!');
                    } else {
                        await message.reply('❌ ¡No estoy reproduciendo nada en este servidor!');
                    }
                    break;

                case 'resume':
                    if (subscription) {
                        subscription.audioPlayer.unpause();
                        await message.reply('▶️ ¡Reanudado!');
                    } else {
                        await message.reply('❌ ¡No estoy reproduciendo nada en este servidor!');
                    }
                    break;

                case 'skip':
                    if (subscription) {
                        subscription.audioPlayer.stop();
                        await message.reply('⏭️ ¡Canción saltada!');
                    } else {
                        await message.reply('❌ ¡No estoy reproduciendo nada en este servidor!');
                    }
                    break;

                case 'stop':
                    if (subscription) {
                        subscription.stop();
                        await message.reply('⏹️ ¡Música detenida y cola vaciada!');
                    } else {
                        await message.reply('❌ ¡No estoy reproduciendo nada en este servidor!');
                    }
                    break;

                case 'queue':
                    if (subscription) {
                        const current =
                            subscription.audioPlayer.state.status === AudioPlayerStatus.Idle
                                ? null
                                : (subscription.audioPlayer.state.resource as AudioResource<Track>);

                        const queue = subscription.queue
                            .slice(0, 10)
                            .map((track, index) => `${index + 1}. ${track.title}`)
                            .join('\n');

                        await message.reply(
                            `${current ? `🎵 **Reproduciendo:** ${current.metadata.title}` : '⏸️ **Nada reproduciéndose**'}\n\n📋 **Cola:**\n${queue || 'Vacía'}`
                        );
                    } else {
                        await message.reply('❌ ¡No estoy reproduciendo nada en este servidor!');
                    }
                    break;

                default:
                    await message.reply(`❌ Comando desconocido. Usa \`${PREFIX}play\`, \`${PREFIX}pause\`, \`${PREFIX}resume\`, \`${PREFIX}skip\`, \`${PREFIX}stop\`, o \`${PREFIX}queue\``);
            }
        } catch (error) {
            Logger.error(`Error executing command ${commandName}:`, error);
            await message.reply('❌ Hubo un error al ejecutar el comando.').catch(() => {});
        }
    },
};

