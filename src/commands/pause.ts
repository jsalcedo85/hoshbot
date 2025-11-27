import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotClient } from '../structures/BotClient';

export const data = new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pauses the music');

export async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const subscription = client.subscriptions.get(interaction.guildId!);

    if (subscription) {
        subscription.audioPlayer.pause();
        await interaction.reply({ content: 'Paused!', ephemeral: true });
    } else {
        await interaction.reply({ content: 'Not playing in this server!', ephemeral: true });
    }
}
