import { ActivityType, Events } from 'discord.js';
import { BotClient } from '../structures/BotClient';
import { Logger } from '../utils/logger';
import { config } from '../config';

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client: BotClient) {
        Logger.log(`✅ Listo! Conectado como ${client.user?.tag}`);
        Logger.log(`🎵 ${config.botName} v${config.version} - Desarrollado por ${config.developer}`);

        // Establecer estado del bot
        client.user?.setPresence({
            activities: [{
                name: '🚧 En Desarrollo | Por Hoshoria',
                type: ActivityType.Playing
            }],
            status: 'online'
        });

        await client.registerCommands();
        Logger.log(`📝 Comandos registrados exitosamente`);
    },
};
