const play = require('play-dl');

async function test() {
    const url = 'https://www.youtube.com/watch?v=hn3wJ1_1Zsg';
    console.log(`Testing play-dl with URL: ${url}`);
    try {
        const stream = await play.stream(url);
        console.log('Stream created successfully');
        console.log('Type:', stream.type);
    } catch (error) {
        console.error('Error creating stream:', error);
    }
}

test();
