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
                
                // Support both default export and named exports (data + execute)
                let command: Command | null = null;
                
                // Check for default export first
                if (commandModule.default && 'data' in commandModule.default && 'execute' in commandModule.default) {
                    command = commandModule.default;
                } 
                // Check for named exports (data + execute)
                else if ('data' in commandModule && 'execute' in commandModule) {
                    command = {
                        data: commandModule.data,
                        execute: commandModule.execute
                    };
                }
                
                if (command && 'data' in command && 'execute' in command) {
                    const commandName = command.data.name;
                    this.commands.set(commandName, command);
                    Logger.log(`Loaded command: ${commandName}`);
                } else {
                    Logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
                    Logger.warn(`Available exports: ${Object.keys(commandModule).join(', ')}`);
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
            Logger.log(`Commands to register: ${this.commands.map(c => c.data.name).join(', ')}`);

            await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commandData },
            );
            Logger.log('Successfully reloaded application (/) commands globally.');
            Logger.log(`Registered commands: ${commandData.map((c: any) => c.name).join(', ')}`);
        } catch (error) {
            Logger.error('Error refreshing application (/) commands', error);
        }
    }
}
