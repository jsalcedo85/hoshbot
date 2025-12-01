#!/bin/bash

# HoshBot - Script de Instalación Completa
# Para Ubuntu limpia con solo git instalado
# Desarrollado por Hoshoria

set -e  # Salir si hay algún error

echo "🎵 =========================================="
echo "   HoshBot - Instalación Completa"
echo "   Desarrollado por Hoshoria"
echo "========================================== 🎵"
echo ""

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para imprimir con color
print_step() {
    echo -e "${BLUE}[PASO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# 1. Actualizar sistema
print_step "Actualizando sistema..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
print_success "Sistema actualizado"

# 2. Instalar dependencias del sistema
print_step "Instalando dependencias del sistema..."
sudo apt-get install -y -qq \
    curl \
    wget \
    build-essential \
    git \
    python3 \
    python3-pip \
    ffmpeg \
    libsodium-dev
print_success "Dependencias del sistema instaladas"

# 3. Instalar Node.js usando nvm
print_step "Instalando Node.js v20 LTS..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
    nvm alias default 20
else
    print_warning "nvm ya está instalado"
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi
print_success "Node.js instalado: $(node -v)"

# 4. Instalar yt-dlp
print_step "Instalando yt-dlp..."
mkdir -p bin
if [ ! -f "bin/yt-dlp" ]; then
    wget -q https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O bin/yt-dlp
    chmod +x bin/yt-dlp
    print_success "yt-dlp instalado"
else
    print_warning "yt-dlp ya existe"
fi

# 4.1. Crear cookies.txt vacío si no existe
print_step "Configurando cookies.txt..."
if [ ! -f "cookies.txt" ]; then
    touch cookies.txt
    print_success "cookies.txt creado (vacío)"
    print_warning "IMPORTANTE: Agrega tus cookies de YouTube a cookies.txt para evitar detección de bots."
    echo "   Puedes exportar cookies usando:"
    echo "   - Extensión del navegador (Get cookies.txt LOCALLY)"
    echo "   - yt-dlp --cookies-from-browser chrome"
else
    print_success "cookies.txt ya existe"
fi

# 5. Crear archivo .env si no existe
print_step "Configurando variables de entorno..."
if [ ! -f ".env" ]; then
    echo "DISCORD_TOKEN=your_token_here" > .env
    echo "CLIENT_ID=your_client_id_here" >> .env
    print_warning "Archivo .env creado. ¡IMPORTANTE! Edita .env con tus credenciales:"
    echo "  - DISCORD_TOKEN"
    echo "  - CLIENT_ID"
else
    print_warning ".env ya existe"
fi

# 6. Instalar dependencias de npm
print_step "Instalando dependencias de npm..."
npm install --silent
print_success "Dependencias de npm instaladas"

# 7. Compilar proyecto
print_step "Compilando proyecto TypeScript..."
npm run build
print_success "Proyecto compilado"

echo ""
echo "🎉 =========================================="
echo "   ¡Instalación Completa!"
echo "========================================== 🎉"
echo ""
echo "📝 Próximos pasos:"
echo "   1. Edita el archivo .env con tus credenciales de Discord"
echo "   2. Ejecuta: ./start.sh"
echo ""
echo "🚀 ¡HoshBot está listo para funcionar!"
echo ""
