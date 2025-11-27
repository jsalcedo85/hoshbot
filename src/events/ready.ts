import { Events } from 'discord.js';
import { BotClient } from '../structures/BotClient';
import { Logger } from '../utils/logger';

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client: BotClient) {
        Logger.log(`Ready! Logged in as ${client.user?.tag}`);
        await client.registerCommands();
    },
};
