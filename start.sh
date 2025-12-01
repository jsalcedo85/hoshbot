#!/bin/bash

# HoshBot - Script de Inicio
# Compatible con macOS y Linux
# Desarrollado por Hoshoria

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

echo "🚀 Iniciando HoshBot..."
npm run start
