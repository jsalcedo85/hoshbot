const ytdl = require('@distube/ytdl-core');
const fs = require('fs');

async function test() {
    const url = 'https://www.youtube.com/watch?v=hn3wJ1_1Zsg';
    console.log(`Testing ytdl-core with URL: ${url}`);
    try {
        const info = await ytdl.getBasicInfo(url);
        console.log('Title:', info.videoDetails.title);

        const stream = ytdl(url, { filter: 'audioonly' });
        stream.on('info', (info) => {
            console.log('Download started');
        });
        stream.on('error', (err) => {
            console.error('Stream error:', err);
        });
        stream.pipe(fs.createWriteStream('test.mp3'));
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
