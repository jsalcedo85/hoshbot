import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotClient } from '../structures/BotClient';

export const data = new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa la música');

export async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const subscription = client.subscriptions.get(interaction.guildId!);

    if (subscription) {
        subscription.audioPlayer.pause();
        await interaction.reply({ content: '⏸️ ¡Pausado!', ephemeral: true });
    } else {
        await interaction.reply({ content: '¡No estoy reproduciendo nada en este servidor!', ephemeral: true });
    }
}
