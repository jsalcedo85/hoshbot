import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { Track } from '../music/Track';
import { MusicSubscription } from '../music/Subscription';


export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce una canción de YouTube o Spotify')
    .addStringOption((option) =>
        option.setName('cancion').setDescription('URL o término de búsqueda').setRequired(true),
    );

import { BotClient } from '../structures/BotClient';

export async function execute(
    interaction: ChatInputCommandInteraction,
    client: BotClient,
) {
    await interaction.deferReply();

    let subscription = client.subscriptions.get(interaction.guildId!);
    const query = interaction.options.getString('cancion')!;

    // Si no hay suscripción, crear una
    if (!subscription) {
        if (interaction.member instanceof GuildMember && interaction.member.voice.channel) {
            const channel = interaction.member.voice.channel;
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator as any,
            });

            subscription = new MusicSubscription(connection);
            subscription.voiceConnection.on('error', console.warn);
            client.subscriptions.set(interaction.guildId!, subscription);
        }
    }

    // Si no hay suscripción, indicar al usuario que se una a un canal
    if (!subscription) {
        await interaction.followUp('¡Únete a un canal de voz e intenta de nuevo!');
        return;
    }

    // Asegurar que la conexión esté lista antes de procesar la solicitud
    try {
        await entersState(subscription.voiceConnection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
        console.warn(error);
        await interaction.followUp('¡No se pudo conectar al canal de voz en 20 segundos, intenta más tarde!');
        return;
    }

    try {
        // Intentar crear una pista desde la URL o búsqueda del usuario
        const track = await Track.from(query, {
            onStart() {
                interaction.followUp({ content: `¡Ahora reproduciendo!`, ephemeral: true }).catch(console.warn);
            },
            onFinish() {
                // No-op
            },
            onError(error) {
                console.warn(error);
                interaction.followUp({ content: `Error: ${error.message}`, ephemeral: true }).catch(console.warn);
            },
        });

        // Agregar pista a la cola y notificar al usuario
        subscription.enqueue(track);
        await interaction.followUp(`🎵 Añadido a la cola: **${track.title}**`);
    } catch (error) {
        console.warn(error);
        await interaction.followUp('¡No se pudo reproducir la pista, intenta más tarde!');
    }
}
