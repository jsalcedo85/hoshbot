import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotClient } from '../structures/BotClient';

export const data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta la canción actual');

export async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const subscription = client.subscriptions.get(interaction.guildId!);

    if (subscription) {
        // Llamar a .stop() en el AudioPlayer hace que transite al estado Idle.
        // Debido al listener de transición de estado en MusicSubscription, las transiciones al estado Idle cargarán y reproducirán la siguiente pista de la cola.
        subscription.audioPlayer.stop();
        await interaction.reply('⏭️ ¡Canción saltada!');
    } else {
        await interaction.reply('¡No estoy reproduciendo nada en este servidor!');
    }
}
