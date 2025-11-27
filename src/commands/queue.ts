import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { AudioPlayerStatus, AudioResource } from '@discordjs/voice';
import { BotClient } from '../structures/BotClient';
import { Track } from '../music/Track';

export const data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Ver la cola de música');

export async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const subscription = client.subscriptions.get(interaction.guildId!);

    if (subscription) {
        const current =
            subscription.audioPlayer.state.status === AudioPlayerStatus.Idle
                ? null
                : (subscription.audioPlayer.state.resource as AudioResource<Track>);

        const queue = subscription.queue
            .slice(0, 5)
            .map((track, index) => `${index + 1}. ${track.title}`)
            .join('\n');

        await interaction.reply(`${current ? `🎵 **Reproduciendo:** ${current.metadata.title}` : '⏸️ **Nada reproduciéndose**'}\n\n📋 **Cola:**\n${queue || 'Vacía'}`);
    } else {
        await interaction.reply('¡No estoy reproduciendo nada en este servidor!');
    }
}
