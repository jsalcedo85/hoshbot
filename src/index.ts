import { BotClient } from './structures/BotClient';
import { cacheManager } from './music/CacheManager';

const client = new BotClient();

// Initialize cache before starting bot
(async () => {
    await cacheManager.initialize();
    client.start();
})();
