import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { MqttHandler } from './mqtt';
import { Database } from './database';

const PORT = process.env.INGRESS_PORT || 8099;
const DATA_DIR = process.env.DATA_DIR || './data';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize database
const db = new Database(path.join(DATA_DIR, 'devices.json'));

// Initialize MQTT handler
const mqttHandler = new MqttHandler({
    host: process.env.MQTT_HOST || 'localhost',
    port: parseInt(process.env.MQTT_PORT || '1883'),
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web/dist')));

// API Routes

// Get all discovered devices
app.get('/api/devices', (req, res) => {
    const devices = db.getDevices();
    res.json(devices);
});

// Get device config
app.get('/api/devices/:deviceId/config', (req, res) => {
    const config = db.getDeviceConfig(req.params.deviceId);
    if (config) {
        res.json(config);
    } else {
        res.status(404).json({ error: 'Config not found' });
    }
});

// Save and deploy device config
app.post('/api/devices/:deviceId/config', async (req, res) => {
    const { deviceId } = req.params;
    const config = req.body;

    // Save to database
    db.saveDeviceConfig(deviceId, config);

    // Deploy to device via MQTT
    try {
        await mqttHandler.deployConfig(deviceId, config);
        res.json({ success: true, message: 'Config deployed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to deploy config' });
    }
});

// WebSocket for real-time device updates
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    // Send current devices
    ws.send(JSON.stringify({
        type: 'devices',
        data: db.getDevices()
    }));

    // Handle messages from client
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('WebSocket message:', data);
        } catch (e) {
            console.error('Invalid WebSocket message');
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// Forward MQTT events to WebSocket clients
mqttHandler.on('deviceDiscovered', (device) => {
    db.updateDevice(device);
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({
                type: 'deviceDiscovered',
                data: device
            }));
        }
    });
});

mqttHandler.on('deviceStatus', (deviceId, status) => {
    db.updateDeviceStatus(deviceId, status);
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({
                type: 'deviceStatus',
                data: { deviceId, status }
            }));
        }
    });
});

mqttHandler.on('configStatus', (deviceId, status) => {
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({
                type: 'configStatus',
                data: { deviceId, ...status }
            }));
        }
    });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../web/dist/index.html'));
});

// Start server
server.listen(PORT, () => {
    console.log(`Stream Deck Manager running on port ${PORT}`);
});

// Connect to MQTT
mqttHandler.connect();
