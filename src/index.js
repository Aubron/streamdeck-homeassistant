const { openStreamDeck } = require('@elgato-stream-deck/node');
const mqtt = require('mqtt');
const Jimp = require('jimp');
const path = require('path');

// Configuration
const MQTT_URL = process.env.MQTT_URL || 'mqtt://homeassistant.local';
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;
// Unique ID for this device. Balena provides RESIN_DEVICE_UUID, or use hostname, or fallback.
const DEVICE_ID = process.env.BALENA_DEVICE_UUID || process.env.HOSTNAME || 'streamdeck-unknown';
const DISCOVERY_PREFIX = process.env.DISCOVERY_PREFIX || 'homeassistant';
const BASE_TOPIC = `streamdeck/${DEVICE_ID}`;

console.log(`Starting Stream Deck Controller for device: ${DEVICE_ID}`);

// Connect to MQTT
const client = mqtt.connect(MQTT_URL, {
    username: MQTT_USER,
    password: MQTT_PASS
});

let myStreamDeck = null;

client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe(`${BASE_TOPIC}/+/set_brightness`);
    client.subscribe(`${BASE_TOPIC}/key/+/set_image`);
    client.subscribe(`${BASE_TOPIC}/key/+/set_text`);
    client.subscribe(`${BASE_TOPIC}/command`); // For global commands like 'clear'

    // Announce device? Optional.
    client.publish(`${BASE_TOPIC}/status`, 'online', { retain: true });
});

client.on('error', (err) => {
    console.error('MQTT Error:', err);
});

// Stream Deck Logic
async function main() {
    try {
        // Open the first found stream deck
        myStreamDeck = await openStreamDeck();

        console.log(`Connected to Stream Deck: ${myStreamDeck.MODEL}`);

        // Clear the device
        await myStreamDeck.clear();

        // Publish device info
        client.publish(`${BASE_TOPIC}/info`, JSON.stringify({
            model: myStreamDeck.MODEL,
            serial: await myStreamDeck.getSerialNumber(),
            firmware: await myStreamDeck.getFirmwareVersion(),
            columns: myStreamDeck.KEY_COLUMNS,
            rows: myStreamDeck.KEY_ROWS,
            keyCount: myStreamDeck.NUM_KEYS
        }), { retain: true });

        // Event listeners
        myStreamDeck.on('down', (keyIndex) => {
            console.log(`Key ${keyIndex} down`);
            client.publish(`${BASE_TOPIC}/key/${keyIndex}/state`, 'pressed');
        });

        myStreamDeck.on('up', (keyIndex) => {
            console.log(`Key ${keyIndex} up`);
            client.publish(`${BASE_TOPIC}/key/${keyIndex}/state`, 'released');
        });

        myStreamDeck.on('error', (error) => {
            console.error('Stream Deck Error:', error);
            client.publish(`${BASE_TOPIC}/status`, 'error');
        });

    } catch (e) {
        console.error('Error opening Stream Deck:', e);
        // Retry logic could go here
        setTimeout(main, 5000);
    }
}

// Handle MQTT Messages
client.on('message', async (topic, message) => {
    if (!myStreamDeck) return;

    const msgStr = message.toString();

    // Topic parsing
    // ${BASE_TOPIC}/key/${keyIndex}/set_image
    if (topic.includes('/set_image')) {
        const parts = topic.split('/');
        const keyIndex = parseInt(parts[parts.indexOf('key') + 1]);
        if (!isNaN(keyIndex)) {
            try {
                // If message starts with 'http', fetch it.
                // If it starts with '#', simple color fill.
                // If it looks like base64, load Buffer.

                if (msgStr.startsWith('#')) {
                    // Fill color
                    const r = parseInt(msgStr.substr(1, 2), 16);
                    const g = parseInt(msgStr.substr(3, 2), 16);
                    const b = parseInt(msgStr.substr(5, 2), 16);
                    await myStreamDeck.fillKeyColor(keyIndex, r, g, b);
                } else if (msgStr.startsWith('http')) {
                    // Load from URL
                    const image = await Jimp.read(msgStr);
                    const resized = image.resize(myStreamDeck.ICON_SIZE, myStreamDeck.ICON_SIZE);
                    const buffer = resized.bitmap.data; // This might need format conversion for Stream Deck
                    // Stream Deck expects specific format (usually JPEG or BMP depending on model, or raw buffer)
                    // @elgato-stream-deck/node abstracts this slightly but we typically provide a buffer.
                    // Let's use the fillKeyBuffer method if we can get the raw pixel data in correct format.
                    // Actually, the library creates a sharp/jimp wrapper usually.
                    // Let's assume we pass the buffer of the resized image.
                    // For better compatibility, let's write to a buffer in BMP/JPEG.

                    const imgBuffer = await resized.getBufferAsync(Jimp.MIME_JPEG);
                    await myStreamDeck.fillKeyBuffer(keyIndex, imgBuffer);
                } else {
                    console.log(`Unknown image format for key ${keyIndex}`);
                }
            } catch (err) {
                console.error(`Error interpreting image command for key ${keyIndex}:`, err);
            }
        }
    } else if (topic.includes('/set_text')) {
        const parts = topic.split('/');
        const keyIndex = parseInt(parts[parts.indexOf('key') + 1]);
        if (!isNaN(keyIndex)) {
            try {
                // Create an image with text
                const image = new Jimp(myStreamDeck.ICON_SIZE, myStreamDeck.ICON_SIZE, 0x000000FF);
                const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

                // Measure text to center it (approximate)
                const textWidth = Jimp.measureText(font, msgStr);
                const textHeight = Jimp.measureTextHeight(font, msgStr, myStreamDeck.ICON_SIZE);

                const x = (myStreamDeck.ICON_SIZE - textWidth) / 2;
                const y = (myStreamDeck.ICON_SIZE - textHeight) / 2;

                image.print(font, x, y, msgStr);

                const imgBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
                await myStreamDeck.fillKeyBuffer(keyIndex, imgBuffer);
            } catch (err) {
                console.error(`Error drawing text for key ${keyIndex}:`, err);
            }
        }
    }
});

// Handle Exit
process.on('SIGINT', async () => {
    if (myStreamDeck) {
        await myStreamDeck.clear();
        await myStreamDeck.close();
    }
    client.end();
    process.exit();
});

main();
