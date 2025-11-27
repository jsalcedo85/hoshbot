import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotClient } from '../structures/BotClient';

export const data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops the music and clears the queue');

export async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const subscription = client.subscriptions.get(interaction.guildId!);

    if (subscription) {
        subscription.stop();
        await interaction.reply('Stopped the music and cleared the queue!');
    } else {
        await interaction.reply('Not playing in this server!');
    }
}
