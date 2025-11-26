import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
    throw new Error('Missing environment variables');
}

export const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
};
