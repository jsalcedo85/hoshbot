import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { Track } from '../music/Track';
import { MusicSubscription } from '../music/Subscription';
import play from 'play-dl';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays a song from YouTube or Spotify')
    .addStringOption((option) =>
        option.setName('query').setDescription('The URL or search query').setRequired(true),
    );

export async function execute(
    interaction: ChatInputCommandInteraction,
    subscriptions: Map<string, MusicSubscription>,
) {
    await interaction.deferReply();

    let subscription = subscriptions.get(interaction.guildId!);
    const query = interaction.options.getString('query')!;

    // If there is no subscription, create one
    if (!subscription) {
        if (interaction.member instanceof GuildMember && interaction.member.voice.channel) {
            const channel = interaction.member.voice.channel;
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });

            subscription = new MusicSubscription(connection);
            subscription.voiceConnection.on('error', console.warn);
            subscriptions.set(interaction.guildId!, subscription);
        }
    }

    // If there is no subscription, tell the user they need to join a channel
    if (!subscription) {
        await interaction.followUp('Join a voice channel and then try that again!');
        return;
    }

    // Make sure the connection is ready before processing the user's request
    try {
        await entersState(subscription.voiceConnection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
        console.warn(error);
        await interaction.followUp('Failed to join voice channel within 20 seconds, please try again later!');
        return;
    }

    try {
        // Attempt to create a Track from the user's video URL
        const track = await Track.from(query, {
            onStart() {
                interaction.followUp({ content: `Now playing!`, ephemeral: true }).catch(console.warn);
            },
            onFinish() {
                interaction.followUp({ content: `Finished playing!`, ephemeral: true }).catch(console.warn);
            },
            onError(error) {
                console.warn(error);
                interaction.followUp({ content: `Error: ${error.message}`, ephemeral: true }).catch(console.warn);
            },
        });

        // Enqueue the track and reply a success message to the user
        subscription.enqueue(track);
        await interaction.followUp(`Enqueued **${track.title}**`);
    } catch (error) {
        console.warn(error);
        await interaction.followUp('Failed to play track, please try again later!');
    }
}
