import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { MusicSubscription } from '../music/Subscription';
import { AudioPlayerStatus } from '@discordjs/voice';

export const pause = {
    data: new SlashCommandBuilder().setName('pause').setDescription('Pauses the music'),
    async execute(interaction: ChatInputCommandInteraction, subscriptions: Map<string, MusicSubscription>) {
        const subscription = subscriptions.get(interaction.guildId!);
        if (subscription) {
            subscription.audioPlayer.pause();
            await interaction.reply({ content: `Paused!`, ephemeral: true });
        } else {
            await interaction.reply('Not playing in this server!');
        }
    },
};

export const resume = {
    data: new SlashCommandBuilder().setName('resume').setDescription('Resumes the music'),
    async execute(interaction: ChatInputCommandInteraction, subscriptions: Map<string, MusicSubscription>) {
        const subscription = subscriptions.get(interaction.guildId!);
        if (subscription) {
            subscription.audioPlayer.unpause();
            await interaction.reply({ content: `Unpaused!`, ephemeral: true });
        } else {
            await interaction.reply('Not playing in this server!');
        }
    },
};

export const skip = {
    data: new SlashCommandBuilder().setName('skip').setDescription('Skips the current song'),
    async execute(interaction: ChatInputCommandInteraction, subscriptions: Map<string, MusicSubscription>) {
        const subscription = subscriptions.get(interaction.guildId!);
        if (subscription) {
            subscription.audioPlayer.stop();
            await interaction.reply({ content: `Skipped song!`, ephemeral: true });
        } else {
            await interaction.reply('Not playing in this server!');
        }
    },
};

export const stop = {
    data: new SlashCommandBuilder().setName('stop').setDescription('Stops the music and clears the queue'),
    async execute(interaction: ChatInputCommandInteraction, subscriptions: Map<string, MusicSubscription>) {
        const subscription = subscriptions.get(interaction.guildId!);
        if (subscription) {
            subscription.stop();
            await interaction.reply({ content: `Stopped music!`, ephemeral: true });
        } else {
            await interaction.reply('Not playing in this server!');
        }
    },
};

export const queue = {
    data: new SlashCommandBuilder().setName('queue').setDescription('Shows the current queue'),
    async execute(interaction: ChatInputCommandInteraction, subscriptions: Map<string, MusicSubscription>) {
        const subscription = subscriptions.get(interaction.guildId!);
        if (subscription) {
            const current =
                subscription.audioPlayer.state.status === AudioPlayerStatus.Idle
                    ? `Nothing is currently playing!`
                    : `Playing **${(subscription.audioPlayer.state.resource as any).metadata.title}**`;

            const queue = subscription.queue
                .slice(0, 5)
                .map((track, index) => `${index + 1}) ${track.title}`)
                .join('\n');

            await interaction.reply(`${current}\n\n${queue}`);
        } else {
            await interaction.reply('Not playing in this server!');
        }
    },
};
