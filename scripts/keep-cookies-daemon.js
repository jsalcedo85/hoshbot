#!/usr/bin/env node

/**
 * HoshBot - Daemon para Mantener Cookies Vivas
 * Ejecuta requests periódicos a YouTube cada 30 minutos
 * Desarrollado por Hoshoria
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const COOKIES_PATH = path.join(__dirname, '..', 'cookies.txt');
const YT_DLP_PATH = path.join(__dirname, '..', 'bin', 'yt-dlp');
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
const TEST_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

let isRunning = true;
let lastCheck = null;

// Función para hacer request a YouTube
function checkCookies() {
    return new Promise((resolve) => {
        if (!fs.existsSync(COOKIES_PATH)) {
            console.log(`[Cookies Daemon] ${new Date().toISOString()} - cookies.txt no existe, saltando verificación`);
            resolve(false);
            return;
        }

        console.log(`[Cookies Daemon] ${new Date().toISOString()} - Verificando cookies...`);
        
        const process = spawn(YT_DLP_PATH, [
            '--cookies', COOKIES_PATH,
            '--quiet',
            '--no-warnings',
            '--skip-download',
            TEST_URL
        ], {
            stdio: ['ignore', 'ignore', 'pipe']
        });

        let errorOutput = '';
        process.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                console.log(`[Cookies Daemon] ${new Date().toISOString()} - ✓ Cookies verificadas correctamente`);
                lastCheck = { success: true, timestamp: Date.now() };
                resolve(true);
            } else {
                console.log(`[Cookies Daemon] ${new Date().toISOString()} - ✗ Error verificando cookies (código: ${code})`);
                if (errorOutput.includes('Sign in to confirm') || errorOutput.includes('authentication')) {
                    console.log(`[Cookies Daemon] ${new Date().toISOString()} - ⚠️  Las cookies pueden estar expiradas`);
                }
                lastCheck = { success: false, timestamp: Date.now() };
                resolve(false);
            }
        });

        process.on('error', (error) => {
            console.log(`[Cookies Daemon] ${new Date().toISOString()} - ✗ Error ejecutando yt-dlp: ${error.message}`);
            lastCheck = { success: false, timestamp: Date.now(), error: error.message };
            resolve(false);
        });
    });
}

// Función principal
async function main() {
    console.log(`[Cookies Daemon] Iniciando daemon de cookies (cada 30 minutos)`);
    console.log(`[Cookies Daemon] Cookies path: ${COOKIES_PATH}`);
    console.log(`[Cookies Daemon] yt-dlp path: ${YT_DLP_PATH}`);
    
    // Verificar que yt-dlp existe
    if (!fs.existsSync(YT_DLP_PATH)) {
        console.error(`[Cookies Daemon] ERROR: yt-dlp no encontrado en ${YT_DLP_PATH}`);
        process.exit(1);
    }

    // Hacer primera verificación inmediatamente
    await checkCookies();

    // Configurar intervalo
    const interval = setInterval(async () => {
        if (!isRunning) {
            clearInterval(interval);
            return;
        }
        await checkCookies();
    }, INTERVAL_MS);

    // Manejar señales de terminación
    process.on('SIGTERM', () => {
        console.log(`[Cookies Daemon] ${new Date().toISOString()} - Recibida señal SIGTERM, deteniendo...`);
        isRunning = false;
        clearInterval(interval);
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log(`[Cookies Daemon] ${new Date().toISOString()} - Recibida señal SIGINT, deteniendo...`);
        isRunning = false;
        clearInterval(interval);
        process.exit(0);
    });

    // Mantener el proceso vivo
    process.on('exit', () => {
        console.log(`[Cookies Daemon] ${new Date().toISOString()} - Daemon detenido`);
    });
}

// Ejecutar
main().catch((error) => {
    console.error(`[Cookies Daemon] ERROR: ${error.message}`);
    process.exit(1);
});

