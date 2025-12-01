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

Para evitar problemas de autenticación con YouTube, exporta tus cookies con expiración de 1 año:

```bash
# Ejecutar script de exportación de cookies
./export-cookies.sh
```

El script te guiará para:
- Exportar cookies desde Chrome/Chromium/Firefox
- O usar extensión del navegador
- Extender la expiración a 1 año automáticamente

**Nota:** Las cookies son necesarias para evitar la detección de bots de YouTube. Sin cookies válidas, el bot puede fallar al reproducir música.

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