import { openStreamDeck, listStreamDecks, StreamDeck } from '@elgato-stream-deck/node';
import mqtt from 'mqtt';
import Jimp from 'jimp';
import { ConfigManager } from './ConfigManager';
import { PageRenderer } from './PageRenderer';
import { NavigationManager } from './NavigationManager';
import { DeviceConfig } from './types';
import { createHash } from 'crypto';

// Read version from package.json
const pkg = require('../package.json');
const VERSION = pkg.version || '1.0.0';

// Configuration
const MQTT_URL = process.env.MQTT_URL || 'mqtt://homeassistant.local';
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;
const DEVICE_ID = process.env.BALENA_DEVICE_UUID || process.env.HOSTNAME || 'streamdeck-unknown';
const BASE_TOPIC = `streamdeck/${DEVICE_ID}`;

console.log(`Starting Stream Deck Controller v${VERSION} for device: ${DEVICE_ID}`);

// Connect to MQTT
const client = mqtt.connect(MQTT_URL, {
    username: MQTT_USER,
    password: MQTT_PASS,
    will: {
        topic: `${BASE_TOPIC}/status`,
        payload: Buffer.from('offline'),
        retain: true,
        qos: 1
    }
});

let myStreamDeck: StreamDeck | null = null;
let navManager: NavigationManager | null = null;
let renderer: PageRenderer | null = null;

client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe(`${BASE_TOPIC}/+/set_brightness`);
    client.subscribe(`${BASE_TOPIC}/key/+/set_image`);
    client.subscribe(`${BASE_TOPIC}/key/+/set_text`);
    client.subscribe(`${BASE_TOPIC}/command`);
    client.subscribe(`${BASE_TOPIC}/config/set`);

    client.publish(`${BASE_TOPIC}/status`, 'online', { retain: true });
});

client.on('error', (err) => {
    console.error('MQTT Error:', err);
});

/**
 * Compute a short hash of the config for acknowledgment
 */
function configHash(config: DeviceConfig): string {
    const str = JSON.stringify(config);
    return createHash('md5').update(str).digest('hex').substring(0, 8);
}

/**
 * Publish config acknowledgment
 */
function publishConfigStatus(status: 'applied' | 'error', config: DeviceConfig, error?: string) {
    const payload = {
        status,
        configHash: configHash(config),
        timestamp: new Date().toISOString(),
        error: error || null
    };
    client.publish(`${BASE_TOPIC}/config/status`, JSON.stringify(payload), { retain: true });
}

/**
 * Apply a new configuration
 */
async function applyConfig(config: DeviceConfig) {
    if (!myStreamDeck || !navManager) {
        console.error('Cannot apply config: device not ready');
        return;
    }

    try {
        // Save to cache for startup reliability
        ConfigManager.saveConfig(config);

        // Update navigation manager
        await navManager.updateConfig(config);

        // Publish success acknowledgment
        publishConfigStatus('applied', config);
        console.log('Config applied successfully');
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error('Error applying config:', errorMsg);
        publishConfigStatus('error', config, errorMsg);
    }
}

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
        try {
            for (let i = 0; i < myStreamDeck.NUM_KEYS; i++) {
                await myStreamDeck.clearKey(i);
            }
        } catch (e) {
            console.error('Error clearing device:', e);
        }

        // Initialize Renderer
        renderer = new PageRenderer(myStreamDeck);

        // Try to load cached config
        const cachedConfig = ConfigManager.getCachedConfig();

        if (cachedConfig) {
            // Use cached config
            console.log('Using cached config');
            if (cachedConfig.brightness) {
                await myStreamDeck.setBrightness(cachedConfig.brightness);
            }
            const configManager = new ConfigManager();
            navManager = new NavigationManager(myStreamDeck, client, configManager, renderer, cachedConfig);
            await navManager.start();
        } else {
            // No config - show "waiting for config" state
            console.log('No cached config found. Waiting for config via MQTT...');
            await myStreamDeck.setBrightness(50);

            // Create a minimal empty config for initialization
            const emptyConfig: DeviceConfig = { pages: { default: [] } };
            const configManager = new ConfigManager();
            navManager = new NavigationManager(myStreamDeck, client, configManager, renderer, emptyConfig);

            // Display "waiting" indicator on first key
            try {
                const waitImg = new Jimp(myStreamDeck.ICON_SIZE, myStreamDeck.ICON_SIZE, 0x333333FF);
                const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
                waitImg.print(font, 5, 5, { text: 'Waiting', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, myStreamDeck.ICON_SIZE, myStreamDeck.ICON_SIZE);
                const buffer = await waitImg.getBufferAsync(Jimp.MIME_BMP);
                // Convert to raw BGR
                const { data, width, height } = waitImg.bitmap;
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
                await myStreamDeck.fillKeyBuffer(0, rawBuffer);
            } catch (e) {
                console.error('Error displaying waiting state:', e);
            }
        }

        // Publish discovery message with full device info
        const discoveryPayload = {
            model: myStreamDeck.MODEL,
            serial: await myStreamDeck.getSerialNumber(),
            firmware: await myStreamDeck.getFirmwareVersion(),
            version: VERSION,
            columns: myStreamDeck.KEY_COLUMNS,
            rows: myStreamDeck.KEY_ROWS,
            keyCount: myStreamDeck.NUM_KEYS,
            iconSize: myStreamDeck.ICON_SIZE,
            capabilities: {
                brightness: true,
                lcd: false // Stream Deck + has LCD, could be detected in future
            },
            timestamp: new Date().toISOString()
        };
        client.publish(`${BASE_TOPIC}/discovery`, JSON.stringify(discoveryPayload), { retain: true });
        console.log('Published discovery:', JSON.stringify(discoveryPayload, null, 2));

        // Event listeners
        myStreamDeck.on('down', async (keyIndex: number) => {
            console.log(`Key ${keyIndex} down`);
            client.publish(`${BASE_TOPIC}/key/${keyIndex}/state`, 'pressed');

            if (navManager) {
                const action = await navManager.handleButtonPress(keyIndex);
                if (action) {
                    if (action.type === 'mqtt') {
                        client.publish(action.topic, action.payload, { retain: action.retain });
                    } else if (action.type === 'command') {
                        if (action.command === 'clear') {
                            for (let i = 0; i < (myStreamDeck?.NUM_KEYS || 0); i++) {
                                await myStreamDeck?.clearKey(i);
                            }
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

// Handle MQTT Messages
client.on('message', async (topic, message) => {
    const msgStr = message.toString();

    // Handle config/set - apply new configuration
    if (topic === `${BASE_TOPIC}/config/set`) {
        console.log('Received config update via MQTT');
        try {
            const config = JSON.parse(msgStr) as DeviceConfig;
            if (config && config.pages) {
                await applyConfig(config);
            } else {
                console.error('Invalid config format: missing pages');
                if (myStreamDeck) {
                    publishConfigStatus('error', config, 'Invalid config format: missing pages');
                }
            }
        } catch (e) {
            console.error('Error parsing config:', e);
        }
        return;
    }

    if (!myStreamDeck) return;

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
                const { data, width } = image.bitmap;
                const rawBuffer = Buffer.alloc(myStreamDeck.ICON_SIZE * myStreamDeck.ICON_SIZE * 3);
                for (let yy = 0; yy < myStreamDeck.ICON_SIZE; yy++) {
                    for (let xx = 0; xx < myStreamDeck.ICON_SIZE; xx++) {
                        const srcIdx = (yy * width + xx) * 4;
                        const destIdx = (yy * myStreamDeck.ICON_SIZE + xx) * 3;
                        rawBuffer[destIdx] = data[srcIdx + 2];
                        rawBuffer[destIdx + 1] = data[srcIdx + 1];
                        rawBuffer[destIdx + 2] = data[srcIdx];
                    }
                }
                await myStreamDeck.fillKeyBuffer(keyIndex, rawBuffer);
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
