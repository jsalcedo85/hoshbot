import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
    throw new Error('❌ Faltan variables de entorno requeridas (DISCORD_TOKEN, CLIENT_ID)');
}

export const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    developer: 'Hoshoria',
    botName: 'HoshBot',
    version: '1.0.0',
};
