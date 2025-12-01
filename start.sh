#!/bin/bash

# HoshBot - Script de Inicio
# Compatible con macOS y Linux
# Desarrollado por Hoshoria

# Limpiar terminal
clear

# Detectar sistema operativo
OS="$(uname -s)"

# Configurar PATH según el sistema
if [ "$OS" = "Darwin" ]; then
    # macOS - usar nvm desde Homebrew o instalación manual
    if [ -d "$HOME/.nvm" ]; then
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
    # También intentar con instalación de Homebrew
    if [ -s "/usr/local/opt/nvm/nvm.sh" ]; then
        export NVM_DIR="/usr/local/opt/nvm"
        \. "/usr/local/opt/nvm/nvm.sh"
    fi
elif [ "$OS" = "Linux" ]; then
    # Linux - usar nvm desde instalación estándar
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Verificar que Node.js esté disponible
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js no está instalado o no está en el PATH"
    echo "   Por favor ejecuta ./install.sh primero"
    exit 1
fi

echo "🎵 Starting HoshBot with Node $(node -v)..."
echo "🧹 Limpiando directorio dist..."
rm -rf dist

echo "🔨 Compilando proyecto..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Error: La compilación falló"
    exit 1
fi

# 3. Iniciar daemon de cookies en background (si cookies.txt existe)
COOKIES_DAEMON_PID=""
if [ -f "cookies.txt" ]; then
    echo "🍪 Iniciando daemon de cookies (cada 30 minutos)..."
    # Crear directorio de logs si no existe
    mkdir -p logs
    # Ejecutar daemon en background y guardar logs
    node scripts/keep-cookies-daemon.js >> logs/cookies-daemon.log 2>&1 &
    COOKIES_DAEMON_PID=$!
    echo "✅ Daemon de cookies iniciado (PID: $COOKIES_DAEMON_PID)"
    echo "   Logs: logs/cookies-daemon.log"
else
    echo "⚠️  cookies.txt no encontrado, daemon de cookies no iniciado"
fi

# Función para limpiar procesos al salir
cleanup() {
    echo ""
    echo "🛑 Deteniendo procesos..."
    if [ ! -z "$COOKIES_DAEMON_PID" ]; then
        echo "   Deteniendo daemon de cookies (PID: $COOKIES_DAEMON_PID)..."
        kill $COOKIES_DAEMON_PID 2>/dev/null || true
    fi
    exit 0
}

# Capturar señales de terminación
trap cleanup SIGINT SIGTERM

# 4. Ejecutar el bot
echo "🚀 Iniciando HoshBot..."
npm run start

# Limpiar al salir
cleanup
