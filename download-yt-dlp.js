const YtDlpWrap = require('yt-dlp-wrap').default;
const fs = require('fs');
const path = require('path');

const binDir = path.join(__dirname, 'bin');
if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir);
}

const binaryPath = path.join(binDir, 'yt-dlp');

console.log('Downloading yt-dlp binary...');
YtDlpWrap.downloadFromGithub(binaryPath)
    .then(() => {
        console.log('Downloaded yt-dlp binary successfully!');
        // Make it executable
        fs.chmodSync(binaryPath, '755');
    })
    .catch((err) => {
        console.error('Error downloading yt-dlp:', err);
        process.exit(1);
    });
