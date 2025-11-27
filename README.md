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

Después de la instalación, edita el archivo `.env` con tus credenciales de Discord:

```env
DISCORD_TOKEN=tu_token_aqui
CLIENT_ID=tu_client_id_aqui
```

## 🎮 Uso

Inicia el bot con:

```bash
./start.sh
```

## 📝 Comandos Disponibles

- `/play <canción>` - Reproduce una canción de YouTube
- `/skip` - Salta la canción actual
- `/stop` - Detiene la música y limpia la cola
- `/pause` - Pausa la música
- `/resume` - Reanuda la música
- `/queue` - Ver la cola de música

## ✨ Características

- 🇪🇸 **100% en Español** - Todos los comandos y mensajes
- ⚡ **Pre-carga Automática** - Reproducción sin delays entre canciones
- 🧹 **Auto-desconexión** - Se desconecta automáticamente tras 2 min de inactividad
- 👤 **Detección de Soledad** - Se desconecta si está solo por 2 min
- 🎵 **Reproducción Instantánea** - Pre-carga todas las canciones en cola
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