import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotClient } from '../structures/BotClient';

export const data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la música y vacía la cola');

export async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const subscription = client.subscriptions.get(interaction.guildId!);

    if (subscription) {
        subscription.stop();
        await interaction.reply('⏹️ ¡Música detenida y cola vaciada!');
    } else {
        await interaction.reply('¡No estoy reproduciendo nada en este servidor!');
    }
}
