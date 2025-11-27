import { Client, Collection, GatewayIntentBits, REST, Routes } from 'discord.js';
import { Command } from './Command';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { MusicSubscription } from '../music/Subscription';
import * as fs from 'fs';
import * as path from 'path';

export class BotClient extends Client {
    public commands: Collection<string, Command> = new Collection();
    public subscriptions: Map<string, MusicSubscription> = new Map();

    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
            ],
        });
    }

    public async start() {
        this.loadCommands();
        this.loadEvents();
        await this.login(config.token);
    }

    private loadCommands() {
        const commandsPath = path.join(__dirname, '../commands');
        this.readCommandsRecursively(commandsPath);
    }

    private readCommandsRecursively(dir: string) {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                this.readCommandsRecursively(filePath);
            } else if (file.endsWith('.ts') || file.endsWith('.js')) {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const commandModule = require(filePath);
                const command: Command = commandModule.default || commandModule;

                if ('data' in command && 'execute' in command) {
                    this.commands.set(command.data.name, command);
                    Logger.log(`Loaded command: ${command.data.name}`);
                } else {
                    Logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            }
        }
    }

    private loadEvents() {
        const eventsPath = path.join(__dirname, '../events');
        if (!fs.existsSync(eventsPath)) return;

        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const event = require(filePath);
            const eventName = event.name || file.split('.')[0];

            if (event.once) {
                this.once(eventName, (...args) => event.execute(...args, this));
            } else {
                this.on(eventName, (...args) => event.execute(...args, this));
            }
            Logger.log(`Loaded event: ${eventName}`);
        }
    }

    public async registerCommands() {
        const rest = new REST().setToken(config.token);
        const commandData = this.commands.map(command => command.data.toJSON());

        try {
            Logger.log(`Started refreshing ${commandData.length} application (/) commands.`);

            await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commandData },
            );
            Logger.log('Successfully reloaded application (/) commands globally.');
        } catch (error) {
            Logger.error('Error refreshing application (/) commands', error);
        }
    }
}
