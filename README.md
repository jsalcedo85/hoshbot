# HoshBot 🎵

Bot de música para Discord completamente en español, desarrollado por **Hoshoria**.

## 🚀 Instalación Rápida (Ubuntu)

Para una instalación completa en Ubuntu limpia (solo requiere git):

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/hoshbot.git
cd hoshbot

# Ejecutar instalación automática
chmod +x install.sh
./install.sh
```

El script `install.sh` instalará:
- ✅ Node.js v20 LTS (vía nvm)
- ✅ Dependencias del sistema (ffmpeg, build tools, etc.)
- ✅ yt-dlp (descargador de YouTube)
- ✅ Todas las dependencias de npm
- ✅ Compilará el proyecto

## ⚙️ Configuración

### 1. Configurar Discord

Después de la instalación, edita el archivo `.env` con tus credenciales de Discord:

```env
DISCORD_TOKEN=tu_token_aqui
CLIENT_ID=tu_client_id_aqui
```

### 2. Configurar Cookies de YouTube (Recomendado)

Para evitar problemas de autenticación con YouTube, exporta tus cookies:

```bash
# Exportar cookies desde navegador
./export-cookies.sh

# Verificar estado de las cookies
./check-cookies.sh
```

El script `export-cookies.sh` te guiará para:
- Exportar cookies desde Chrome/Chromium/Firefox
- O usar extensión del navegador
- Extender la expiración al máximo permitido automáticamente

**Nota importante:** 
- Las cookies son necesarias para evitar la detección de bots de YouTube
- YouTube puede limitar la duración real de las cookies (aunque intentemos extenderlas)
- **Recomendación:** Renueva las cookies cada 3-6 meses ejecutando `./export-cookies.sh` nuevamente
- Usa `./check-cookies.sh` para verificar cuándo expiran tus cookies actuales
- Usa `./keep-cookies-alive.sh` para mantener las cookies activas haciendo requests periódicos

**Cómo mantener las cookies vivas:**
```bash
# Verificar estado de cookies
./check-cookies.sh

# Mantener cookies activas (hace requests periódicos a YouTube)
./keep-cookies-alive.sh

# Opción 1: Request de prueba
# Opción 2: Modo daemon (ejecuta continuamente)
# Opción 3: Configurar cron job (automático cada 6 horas)
```

**Mejores prácticas:**
- ✅ Renueva cookies cada 3-6 meses
- ✅ Usa `keep-cookies-alive.sh` para mantenerlas activas
- ✅ Mantén la misma IP/location cuando sea posible
- ✅ Evita demasiados requests simultáneos
- ❌ No compartas tus cookies públicamente

## 🎮 Uso

Inicia el bot con:

```bash
./start.sh
```

## 📝 Comandos Disponibles

- `/play <canción>` - Reproduce una canción de YouTube o agrega a la cola
- `/skip` - Salta la canción actual y reproduce la siguiente
- `/stop` - Detiene la música y vacía la cola
- `/pause` - Pausa la reproducción
- `/resume` - Reanuda la reproducción pausada
- `/queue` - Muestra la canción actual y las próximas 5 en la cola

## ✨ Características

- 🇪🇸 **100% en Español** - Todos los comandos y mensajes
- ⚡ **Pre-carga Automática** - Las canciones en cola se descargan en background mientras se reproduce la primera
- 🎵 **Alta Calidad** - Reproduce audio en la mejor calidad disponible (m4a/webm)
- 💾 **Cache Inteligente** - Las canciones se guardan en cache para reproducción instantánea
- 🧹 **Auto-desconexión** - Se desconecta automáticamente tras 2 min de inactividad
- 🚧 **En Desarrollo Activo** - Mejoras continuas

## 🛠️ Tecnologías

- Node.js
- TypeScript
- Discord.js v14
- @discordjs/voice
- yt-dlp
- youtube-sr

## 👨‍💻 Desarrollador

**Hoshoria**

## 📄 Licencia

ISC

---

¡Disfruta de tu música con HoshBot! 🎉