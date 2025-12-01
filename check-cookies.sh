#!/bin/bash

# HoshBot - Script para Verificar Expiración de Cookies
# Muestra cuándo expiran las cookies actuales
# Desarrollado por Hoshoria

echo "🍪 =========================================="
echo "   HoshBot - Verificador de Cookies"
echo "========================================== 🍪"
echo ""

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
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

# Verificar que cookies.txt existe
if [ ! -f "cookies.txt" ]; then
    print_error "cookies.txt no existe"
    echo ""
    echo "Ejecuta ./export-cookies.sh para exportar cookies primero."
    exit 1
fi

print_info "Analizando cookies.txt..."

python3 << EOF
import time
from datetime import datetime

current_time = int(time.time())
expired_count = 0
expiring_soon_count = 0
valid_count = 0
session_count = 0
earliest_expiry = None
latest_expiry = None

with open('cookies.txt', 'r') as f:
    lines = f.readlines()

for line in lines:
    # Skip comments and empty lines
    if line.strip().startswith('#') or not line.strip():
        continue
    
    # Parse Netscape cookie format
    parts = line.strip().split('\t')
    if len(parts) >= 7:
        try:
            expiry_str = parts[4]
            domain = parts[0]
            name = parts[5]
            
            # Session cookies
            if expiry_str == '0' or expiry_str == '':
                session_count += 1
                continue
            
            expiry = int(expiry_str)
            
            # Track earliest and latest expiry
            if earliest_expiry is None or expiry < earliest_expiry:
                earliest_expiry = expiry
            if latest_expiry is None or expiry > latest_expiry:
                latest_expiry = expiry
            
            # Check if expired
            if expiry < current_time:
                expired_count += 1
            # Check if expiring soon (within 30 days)
            elif expiry < current_time + (30 * 24 * 60 * 60):
                expiring_soon_count += 1
                valid_count += 1
            else:
                valid_count += 1
        except (ValueError, IndexError):
            continue

print(f"Total de cookies analizadas:")
print(f"  - Válidas: {valid_count}")
print(f"  - Expirando pronto (30 días): {expiring_soon_count}")
print(f"  - Expiradas: {expired_count}")
print(f"  - Sesión (sin expiración): {session_count}")
print()

if earliest_expiry:
    earliest_date = datetime.fromtimestamp(earliest_expiry)
    days_until = (earliest_expiry - current_time) // (24 * 60 * 60)
    print(f"Cookie que expira más pronto:")
    print(f"  Fecha: {earliest_date.strftime('%Y-%m-%d %H:%M:%S')}")
    if days_until > 0:
        print(f"  Días restantes: {days_until}")
    else:
        print(f"  Estado: EXPIRADA")
    print()

if latest_expiry:
    latest_date = datetime.fromtimestamp(latest_expiry)
    days_until = (latest_expiry - current_time) // (24 * 60 * 60)
    print(f"Cookie que expira más tarde:")
    print(f"  Fecha: {latest_date.strftime('%Y-%m-%d %H:%M:%S')}")
    if days_until > 0:
        print(f"  Días restantes: {days_until}")
    else:
        print(f"  Estado: EXPIRADA")
    print()

if expired_count > 0:
    print("⚠️  ADVERTENCIA: Tienes cookies expiradas. Ejecuta ./export-cookies.sh para renovarlas.")
elif expiring_soon_count > 0:
    print("⚠️  ADVERTENCIA: Algunas cookies expiran pronto. Considera renovarlas ejecutando ./export-cookies.sh")
else:
    print("✓ Las cookies están en buen estado.")
EOF

echo ""
print_info "Para renovar las cookies, ejecuta: ./export-cookies.sh"

