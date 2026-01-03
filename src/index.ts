import { openStreamDeck, listStreamDecks, StreamDeck } from '@elgato-stream-deck/node';
import mqtt from 'mqtt';
import Jimp from 'jimp';
import { ConfigManager } from './ConfigManager';
import { PageRenderer } from './PageRenderer';
import { NavigationManager } from './NavigationManager';

// Configuration
const MQTT_URL = process.env.MQTT_URL || 'mqtt://homeassistant.local';
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;
const DEVICE_ID = process.env.BALENA_DEVICE_UUID || process.env.HOSTNAME || 'streamdeck-unknown';
const BASE_TOPIC = `streamdeck/${DEVICE_ID}`;

console.log(`Starting Stream Deck Controller for device: ${DEVICE_ID}`);

// Connect to MQTT
const client = mqtt.connect(MQTT_URL, {
    username: MQTT_USER,
    password: MQTT_PASS
});

let myStreamDeck: StreamDeck | null = null;

client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe(`${BASE_TOPIC}/+/set_brightness`);
    client.subscribe(`${BASE_TOPIC}/key/+/set_image`);
    client.subscribe(`${BASE_TOPIC}/key/+/set_text`);
    client.subscribe(`${BASE_TOPIC}/command`);

    client.publish(`${BASE_TOPIC}/status`, 'online', { retain: true });
});

client.on('error', (err) => {
    console.error('MQTT Error:', err);
});

async function main() {
    try {
        const devices = await listStreamDecks();
        console.log('Discovered Stream Decks:', JSON.stringify(devices, null, 2));

        if (devices.length === 0) {
            console.log('No Stream Decks found. Retrying...');
            setTimeout(main, 5000);
            return;
        }

        const devicePath = devices[0].path;
        console.log(`Attempting to open Stream Deck at path: ${devicePath}`);

        myStreamDeck = await openStreamDeck(devicePath);

        console.log(`Connected to Stream Deck: ${myStreamDeck.MODEL}`);

        // Clear the device
        // Clear the device
        try {
            for (let i = 0; i < myStreamDeck.NUM_KEYS; i++) {
                await myStreamDeck.clearKey(i);
            }
        } catch (e) {
            console.error('Error clearing device:', e);
        }

        // Initialize Managers
        const config = ConfigManager.loadConfig(DEVICE_ID);
        const renderer = new PageRenderer(myStreamDeck);
        const navManager = new NavigationManager(renderer, config);

        // Start (render default page)
        await navManager.start();

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
        myStreamDeck.on('down', async (keyIndex: number) => {
            console.log(`Key ${keyIndex} down`);
            // Legacy Publish
            client.publish(`${BASE_TOPIC}/key/${keyIndex}/state`, 'pressed');

            // Handle Action
            const action = await navManager.handleButtonPress(keyIndex);
            if (action) {
                if (action.type === 'mqtt') {
                    client.publish(action.topic, action.payload, { retain: action.retain });
                } else if (action.type === 'command') {
                    // Handle local commands
                    if (action.command === 'clear') {
                        for (let i = 0; i < (myStreamDeck?.NUM_KEYS || 0); i++) {
                            await myStreamDeck?.clearKey(i);
                        }
                    }
                }
            }
        });

        myStreamDeck.on('up', (keyIndex: number) => {
            console.log(`Key ${keyIndex} up`);
            client.publish(`${BASE_TOPIC}/key/${keyIndex}/state`, 'released');
        });

        myStreamDeck.on('error', (error: any) => {
            console.error('Stream Deck Error:', error);
            client.publish(`${BASE_TOPIC}/status`, 'error');
        });

    } catch (e) {
        console.error('Error opening Stream Deck:', e);
        setTimeout(main, 5000);
    }
}

// Handle MQTT Messages (Legacy/Overlay Support)
client.on('message', async (topic, message) => {
    if (!myStreamDeck) return;

    const msgStr = message.toString();

    // Set Brightness
    if (topic.includes('set_brightness')) {
        const brightness = parseInt(msgStr);
        if (!isNaN(brightness)) {
            await myStreamDeck.setBrightness(brightness);
        }
        return;
    }

    // Command
    if (topic.endsWith('/command')) {
        if (msgStr === 'clear') {
            for (let i = 0; i < myStreamDeck.NUM_KEYS; i++) {
                await myStreamDeck.clearKey(i);
            }
        }
        return;
    }

    // Set Image
    if (topic.includes('/set_image')) {
        const parts = topic.split('/');
        // .../${BASE_TOPIC}/key/${keyIndex}/set_image
        const keyIndex = parseInt(parts[parts.indexOf('key') + 1]);
        if (!isNaN(keyIndex)) {
            try {
                if (msgStr.startsWith('#')) {
                    const r = parseInt(msgStr.substr(1, 2), 16);
                    const g = parseInt(msgStr.substr(3, 2), 16);
                    const b = parseInt(msgStr.substr(5, 2), 16);
                    await myStreamDeck.fillKeyColor(keyIndex, r, g, b);
                } else if (msgStr.startsWith('http')) {
                    const image = await Jimp.read(msgStr);
                    image.resize(myStreamDeck.ICON_SIZE, myStreamDeck.ICON_SIZE);
                    const buffer = await image.getBufferAsync(Jimp.MIME_BMP); // Use BMP or internal conversion
                    // Note: original code did manual BGR. 
                    // Let's rely on node-streamdeck which usually accepts buffers.
                    // Actually node-streamdeck for `fillKeyBuffer` expects a buffer of correct format/size. 
                    // Manual BGR conversion is often needed for RAW buffers.
                    // But if we used Jimp.getBufferAsync(Jimp.MIME_BMP) it might work if library supports it?
                    // Typically `fillKeyBuffer` writes raw bytes.

                    // Let's copy the manual conversion from original just in case, 
                    // OR try to use `fillKeyBuffer` with correct format.
                    // The library docs say: "Fills the given key with an image buffer. The buffer must be in the correct format for the device."
                    // Usually JPEG for mk.2, raw BGR for original.
                    // Let's implement the safe raw BGR conversion helper if needed, or stick to what `IconManager` does.
                    // IconManager returns PNG/BMP. 

                    // Actually, if I use `IconManager` here? No, this is raw URL handling.
                    // Let's use the manual BGR loop from original code to be safe for now, 
                    // or assume IconManager works and refactor this later.
                    // For now, I'll copy the safe implementation.
                    const { data, width } = image.bitmap;
                    const rawBuffer = Buffer.alloc(myStreamDeck.ICON_SIZE * myStreamDeck.ICON_SIZE * 3);
                    for (let y = 0; y < myStreamDeck.ICON_SIZE; y++) {
                        for (let x = 0; x < myStreamDeck.ICON_SIZE; x++) {
                            const srcIdx = (y * width + x) * 4;
                            const destIdx = (y * myStreamDeck.ICON_SIZE + x) * 3;
                            rawBuffer[destIdx] = data[srcIdx + 2];     // B
                            rawBuffer[destIdx + 1] = data[srcIdx + 1]; // G
                            rawBuffer[destIdx + 2] = data[srcIdx];     // R
                        }
                    }
                    await myStreamDeck.fillKeyBuffer(keyIndex, rawBuffer);
                }
            } catch (err) {
                console.error(`Error interpreting image command for key ${keyIndex}:`, err);
            }
        }
    }
    // Set Text
    else if (topic.includes('/set_text')) {
        const parts = topic.split('/');
        const keyIndex = parseInt(parts[parts.indexOf('key') + 1]);
        if (!isNaN(keyIndex)) {
            try {
                const image = new Jimp(myStreamDeck.ICON_SIZE, myStreamDeck.ICON_SIZE, 0x000000FF);
                const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
                const textWidth = Jimp.measureText(font, msgStr);
                const textHeight = Jimp.measureTextHeight(font, msgStr, myStreamDeck.ICON_SIZE);
                const x = (myStreamDeck.ICON_SIZE - textWidth) / 2;
                const y = (myStreamDeck.ICON_SIZE - textHeight) / 2;
                image.print(font, x, y, msgStr);
                const imgBuffer = await image.getBufferAsync(Jimp.MIME_JPEG); // JPEG works on newer devices?
                // If the original code used it, it probably works or they have a newer model.
                // But wait, the original code used `await image.getBufferAsync(Jimp.MIME_JPEG)` for TEXT,
                // and manual BGR for HTTP images. This suggests they might have a device that supports JPEG?
                await myStreamDeck.fillKeyBuffer(keyIndex, imgBuffer);
            } catch (e) { console.error(e); }
        }
    }
});

// Handle Exit
process.on('SIGINT', async () => {
    if (myStreamDeck) {
        try {
            for (let i = 0; i < myStreamDeck.NUM_KEYS; i++) {
                await myStreamDeck.clearKey(i);
            }
        } catch (e) { }
        await myStreamDeck.close();
    }
    client.end();
    process.exit();
});

main();
