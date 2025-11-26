import { Client, GatewayIntentBits, Collection, Events, Interaction } from 'discord.js';
import { config } from './config';
import { MusicSubscription } from './music/Subscription';
import * as playCommand from './commands/play';
import * as musicControls from './commands/music-controls';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
    ],
});

// Collection of subscriptions (one per guild)
const subscriptions = new Map<string, MusicSubscription>();

// Commands collection
const commands = new Collection<string, any>();

// Register commands
commands.set(playCommand.data.name, playCommand);
commands.set(musicControls.pause.data.name, musicControls.pause);
commands.set(musicControls.resume.data.name, musicControls.resume);
commands.set(musicControls.skip.data.name, musicControls.skip);
commands.set(musicControls.stop.data.name, musicControls.stop);
commands.set(musicControls.queue.data.name, musicControls.queue);

client.once(Events.ClientReady, async (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);

    // Register slash commands
    const commandData = [
        playCommand.data.toJSON(),
        musicControls.pause.data.toJSON(),
        musicControls.resume.data.toJSON(),
        musicControls.skip.data.toJSON(),
        musicControls.stop.data.toJSON(),
        musicControls.queue.data.toJSON(),
    ];

    // For development, we register to the specific guild if provided, otherwise global (which takes time to propagate)
    if (config.guildId) {
        await c.guilds.cache.get(config.guildId)?.commands.set(commandData);
        console.log(`Registered commands to guild ${config.guildId}`);
    } else {
        await c.application?.commands.set(commandData);
        console.log('Registered global commands');
    }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction, subscriptions);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

client.login(config.token);
