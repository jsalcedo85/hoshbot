import { Events, Interaction } from 'discord.js';
import { BotClient } from '../structures/BotClient';
import { Logger } from '../utils/logger';

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction, client: BotClient) {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            Logger.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction, client);
        } catch (error) {
            Logger.error(`Error executing ${interaction.commandName}`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    },
};
