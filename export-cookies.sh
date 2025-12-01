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

# Extender expiración de cookies a máximo permitido (YouTube permite hasta ~1 año)
print_step "Extendiendo expiración de cookies al máximo permitido..."

# Calcular fecha de expiración (1 año desde ahora, máximo permitido por YouTube)
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
# Nota: YouTube limita la expiración de cookies, pero podemos intentar extenderlas
python3 << EOF
import re
import time
from datetime import datetime

expiry_timestamp = $EXPIRY_DATE
current_time = int(time.time())
updated_count = 0
session_count = 0
skipped_count = 0

# Important YouTube cookies that should be preserved as-is or have special handling
# Some cookies like YSC are session cookies and should remain as 0
# Authentication cookies (LOGIN_INFO, SID, etc.) may have server-side expiration limits
important_cookies = ['YSC', 'VISITOR_INFO1_LIVE', 'VISITOR_PRIVACY_METADATA']

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
        original_expiry = parts[4]
        cookie_name = parts[5] if len(parts) > 5 else ''
        
        # Handle session cookies (expiry = 0) - keep them as session cookies
        # YSC and similar cookies are meant to be session-only
        if original_expiry == '0' or original_expiry == '':
            session_count += 1
            updated_lines.append(line)
            continue
        
        # For important cookies, be more conservative
        # Some cookies may have server-side validation that checks expiration
        try:
            original_expiry_int = int(original_expiry)
            
            # If cookie is already set far in the future (more than 6 months), 
            # YouTube may have set it that way intentionally - don't change it
            if original_expiry_int > current_time + (180 * 24 * 60 * 60):  # 6 months
                skipped_count += 1
                updated_lines.append(line)
                continue
            
            # Update expiration for cookies that are expiring soon or expired
            if original_expiry_int <= current_time + (180 * 24 * 60 * 60):  # 6 months or less
                parts[4] = str(expiry_timestamp)
                updated_count += 1
            else:
                # Cookie already has good expiration, keep it
                skipped_count += 1
                updated_lines.append(line)
                continue
        except ValueError:
            # Invalid expiry format, try to set it anyway
            parts[4] = str(expiry_timestamp)
            updated_count += 1
        
        updated_lines.append('\t'.join(parts) + '\n')
    else:
        updated_lines.append(line)

with open('cookies.txt', 'w') as f:
    f.writelines(updated_lines)

print(f"Cookies actualizadas: {updated_count}")
if session_count > 0:
    print(f"Cookies de sesión preservadas: {session_count}")
if skipped_count > 0:
    print(f"Cookies con expiración válida preservadas: {skipped_count}")
print(f"Fecha de expiración configurada: {datetime.fromtimestamp(expiry_timestamp).strftime('%Y-%m-%d %H:%M:%S')}")
print()
print("NOTA: Algunas cookies de YouTube (como LOGIN_INFO, SID) pueden tener")
print("validación del lado del servidor que verifica la expiración real.")
print("Si las cookies expiran antes de tiempo, YouTube está aplicando sus propios límites.")
EOF

if [ $? -eq 0 ]; then
    print_success "Cookies actualizadas con expiración extendida"
    EXPIRY_FORMATTED=$(date -d "@$EXPIRY_DATE" 2>/dev/null || date -r "$EXPIRY_DATE" 2>/dev/null || echo "en 1 año")
    print_success "Las cookies expirarán el: $EXPIRY_FORMATTED"
    echo ""
    print_warning "NOTA: YouTube puede limitar la duración real de las cookies."
    print_warning "Si las cookies expiran antes de tiempo, necesitarás renovarlas ejecutando este script nuevamente."
    print_warning "Recomendación: Renueva las cookies cada 6 meses para evitar problemas."
else
    print_error "Error al actualizar cookies"
    # Restaurar backup
    mv cookies.txt.backup cookies.txt
    exit 1
fi

echo ""
print_success "¡Cookies exportadas y configuradas exitosamente!"
print_warning "Recuerda mantener tus cookies seguras y no compartirlas públicamente"

