#!/bin/bash

# HoshBot - Script para Exportar Cookies con Expiración Extendida
# Este script ayuda a exportar cookies de YouTube con fecha de expiración de 1 año
# Desarrollado por Hoshoria

set -e

echo "🍪 =========================================="
echo "   HoshBot - Exportador de Cookies"
echo "   Con Expiración de 1 Año"
echo "========================================== 🍪"
echo ""

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}[PASO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Verificar que yt-dlp está instalado
if [ ! -f "bin/yt-dlp" ]; then
    print_error "yt-dlp no está instalado. Ejecuta ./install.sh primero."
    exit 1
fi

print_step "Este script exportará cookies de YouTube con expiración de 1 año"
echo ""
echo "Opciones disponibles:"
echo "1. Exportar desde navegador (Chrome/Chromium)"
echo "2. Exportar desde navegador (Firefox)"
echo "3. Usar extensión del navegador (Get cookies.txt LOCALLY)"
echo "4. Actualizar expiración de cookies.txt existente"
echo ""
read -p "Selecciona una opción (1-4): " option

case $option in
    1)
        print_step "Exportando cookies desde Chrome/Chromium..."
        if [ -d "$HOME/.config/google-chrome" ] || [ -d "$HOME/.config/chromium" ]; then
            # Intentar Chrome primero, luego Chromium
            if [ -d "$HOME/.config/google-chrome" ]; then
                BROWSER="chrome"
            else
                BROWSER="chromium"
            fi
            
            print_step "Exportando cookies desde $BROWSER..."
            python3 bin/yt-dlp --cookies-from-browser $BROWSER --cookies cookies.txt https://www.youtube.com
            
            if [ $? -eq 0 ]; then
                print_success "Cookies exportadas exitosamente"
            else
                print_error "Error al exportar cookies. Asegúrate de estar logueado en YouTube."
                exit 1
            fi
        else
            print_error "Chrome/Chromium no encontrado"
            exit 1
        fi
        ;;
    2)
        print_step "Exportando cookies desde Firefox..."
        if [ -d "$HOME/.mozilla/firefox" ]; then
            python3 bin/yt-dlp --cookies-from-browser firefox --cookies cookies.txt https://www.youtube.com
            
            if [ $? -eq 0 ]; then
                print_success "Cookies exportadas exitosamente"
            else
                print_error "Error al exportar cookies. Asegúrate de estar logueado en YouTube."
                exit 1
            fi
        else
            print_error "Firefox no encontrado"
            exit 1
        fi
        ;;
    3)
        print_warning "Usa la extensión 'Get cookies.txt LOCALLY' en tu navegador:"
        echo "1. Instala la extensión desde Chrome Web Store"
        echo "2. Ve a youtube.com y asegúrate de estar logueado"
        echo "3. Haz clic en la extensión y selecciona 'Export'"
        echo "4. Guarda el archivo como 'cookies.txt' en este directorio"
        echo ""
        read -p "Presiona Enter cuando hayas guardado cookies.txt..."
        ;;
    4)
        if [ ! -f "cookies.txt" ]; then
            print_error "cookies.txt no existe"
            exit 1
        fi
        print_step "Actualizando expiración de cookies existentes..."
        ;;
    *)
        print_error "Opción inválida"
        exit 1
        ;;
esac

# Verificar que cookies.txt existe
if [ ! -f "cookies.txt" ]; then
    print_error "cookies.txt no existe. Por favor exporta las cookies primero."
    exit 1
fi

# Extender expiración de cookies a 1 año
print_step "Extendiendo expiración de cookies a 1 año..."

# Calcular fecha de expiración (1 año desde ahora)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    EXPIRY_DATE=$(date -v+1y +%s)
else
    # Linux
    EXPIRY_DATE=$(date -d "+1 year" +%s)
fi

# Crear backup
cp cookies.txt cookies.txt.backup
print_success "Backup creado: cookies.txt.backup"

# Actualizar expiración en cookies.txt
# Formato Netscape: domain, flag, path, secure, expiration, name, value
python3 << EOF
import re
from datetime import datetime, timedelta

expiry_timestamp = $EXPIRY_DATE

with open('cookies.txt', 'r') as f:
    lines = f.readlines()

updated_lines = []
for line in lines:
    # Skip comments and empty lines
    if line.strip().startswith('#') or not line.strip():
        updated_lines.append(line)
        continue
    
    # Parse Netscape cookie format
    parts = line.strip().split('\t')
    if len(parts) >= 7:
        # Update expiration (5th field, index 4)
        parts[4] = str(expiry_timestamp)
        updated_lines.append('\t'.join(parts) + '\n')
    else:
        updated_lines.append(line)

with open('cookies.txt', 'w') as f:
    f.writelines(updated_lines)

print("Cookies actualizadas con expiración de 1 año")
EOF

if [ $? -eq 0 ]; then
    print_success "Cookies actualizadas con expiración de 1 año"
    print_success "Las cookies expirarán el: $(date -d "@$EXPIRY_DATE" 2>/dev/null || date -r "$EXPIRY_DATE" 2>/dev/null || echo "en 1 año")"
else
    print_error "Error al actualizar cookies"
    # Restaurar backup
    mv cookies.txt.backup cookies.txt
    exit 1
fi

echo ""
print_success "¡Cookies exportadas y configuradas exitosamente!"
print_warning "Recuerda mantener tus cookies seguras y no compartirlas públicamente"

