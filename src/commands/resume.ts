import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotClient } from '../structures/BotClient';

export const data = new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Reanuda la música');

export async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const subscription = client.subscriptions.get(interaction.guildId!);

    if (subscription) {
        subscription.audioPlayer.unpause();
        await interaction.reply({ content: '▶️ ¡Reanudado!', ephemeral: true });
    } else {
        await interaction.reply({ content: '¡No estoy reproduciendo nada en este servidor!', ephemeral: true });
    }
}
