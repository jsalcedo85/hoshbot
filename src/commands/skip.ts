import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotClient } from '../structures/BotClient';

export const data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skips the current song');

export async function execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const subscription = client.subscriptions.get(interaction.guildId!);

    if (subscription) {
        // Calling .stop() on an AudioPlayer causes it to transition into the Idle state.
        // Because of a state transition listener defined in MusicSubscription, transitions into the Idle state mean the next track from the queue will be loaded and played.
        subscription.audioPlayer.stop();
        await interaction.reply('Skipped the song!');
    } else {
        await interaction.reply('Not playing in this server!');
    }
}
