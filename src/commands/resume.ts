import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotClient } from '../structures/BotClient';

export const data = new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resumes the music');

export async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const subscription = client.subscriptions.get(interaction.guildId!);

    if (subscription) {
        subscription.audioPlayer.unpause();
        await interaction.reply({ content: 'Unpaused!', ephemeral: true });
    } else {
        await interaction.reply({ content: 'Not playing in this server!', ephemeral: true });
    }
}
