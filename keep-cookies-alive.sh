#!/bin/bash

# HoshBot - Script para Mantener Cookies Vivas
# Hace requests periódicos a YouTube para mantener las cookies activas
# Desarrollado por Hoshoria

echo "🍪 =========================================="
echo "   HoshBot - Mantenedor de Cookies"
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

# Verificar que yt-dlp está instalado
if [ ! -f "bin/yt-dlp" ]; then
    print_error "yt-dlp no está instalado. Ejecuta ./install.sh primero."
    exit 1
fi

print_info "Este script mantendrá las cookies activas haciendo requests periódicos a YouTube"
echo ""
echo "Opciones:"
echo "1. Hacer un request de prueba ahora (verificar que las cookies funcionan)"
echo "2. Ejecutar en modo daemon (hacer requests cada X horas)"
echo "3. Configurar cron job para mantener cookies activas automáticamente"
echo ""
read -p "Selecciona una opción (1-3): " option

case $option in
    1)
        print_step "Haciendo request de prueba a YouTube..."
        python3 bin/yt-dlp --cookies cookies.txt --quiet --no-warnings --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1 | head -5
        
        if [ $? -eq 0 ]; then
            print_success "✓ Las cookies están funcionando correctamente"
        else
            print_error "✗ Las cookies pueden estar expiradas o inválidas"
            print_warning "Ejecuta ./export-cookies.sh para renovarlas"
        fi
        ;;
    2)
        read -p "¿Cada cuántas horas hacer requests? (recomendado: 6-12): " hours
        if ! [[ "$hours" =~ ^[0-9]+$ ]]; then
            print_error "Número inválido"
            exit 1
        fi
        
        print_info "Iniciando daemon para mantener cookies activas cada $hours horas"
        print_info "Presiona Ctrl+C para detener"
        echo ""
        
        while true; do
            print_info "Haciendo request a YouTube para mantener cookies activas..."
            python3 bin/yt-dlp --cookies cookies.txt --quiet --no-warnings --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ" > /dev/null 2>&1
            
            if [ $? -eq 0 ]; then
                print_success "✓ Cookies verificadas - $(date '+%Y-%m-%d %H:%M:%S')"
            else
                print_error "✗ Error verificando cookies - $(date '+%Y-%m-%d %H:%M:%S')"
                print_warning "Considera renovar las cookies ejecutando ./export-cookies.sh"
            fi
            
            sleep $((hours * 3600))
        done
        ;;
    3)
        print_info "Configurando cron job para mantener cookies activas..."
        echo ""
        
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        CRON_CMD="0 */6 * * * cd $SCRIPT_DIR && python3 bin/yt-dlp --cookies cookies.txt --quiet --no-warnings --skip-download 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' > /dev/null 2>&1"
        
        # Verificar si ya existe el cron job
        if crontab -l 2>/dev/null | grep -q "keep-cookies-alive\|yt-dlp.*cookies.txt"; then
            print_warning "Ya existe un cron job relacionado con cookies"
            read -p "¿Deseas reemplazarlo? (s/n): " replace
            if [ "$replace" != "s" ] && [ "$replace" != "S" ]; then
                print_info "Operación cancelada"
                exit 0
            fi
            # Remover cron jobs existentes
            crontab -l 2>/dev/null | grep -v "keep-cookies-alive\|yt-dlp.*cookies.txt" | crontab -
        fi
        
        # Agregar nuevo cron job
        (crontab -l 2>/dev/null; echo "# HoshBot - Mantener cookies activas cada 6 horas"; echo "$CRON_CMD") | crontab -
        
        if [ $? -eq 0 ]; then
            print_success "Cron job configurado exitosamente"
            print_info "Las cookies se verificarán cada 6 horas automáticamente"
            echo ""
            print_info "Cron jobs actuales:"
            crontab -l | grep -A 1 "HoshBot\|yt-dlp"
        else
            print_error "Error al configurar cron job"
            exit 1
        fi
        ;;
    *)
        print_error "Opción inválida"
        exit 1
        ;;
esac

echo ""
print_info "Consejos para mantener cookies vivas:"
echo "  • Renueva las cookies cada 3-6 meses ejecutando ./export-cookies.sh"
echo "  • Usa ./check-cookies.sh para verificar el estado de las cookies"
echo "  • Mantén la misma IP/location cuando sea posible"
echo "  • Evita hacer demasiados requests simultáneos a YouTube"

