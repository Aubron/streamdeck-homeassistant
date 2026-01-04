import mqtt, { MqttClient } from 'mqtt';
import { EventEmitter } from 'events';

interface MqttConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
}

interface DiscoveryPayload {
    model: string;
    serial: string;
    firmware: string;
    version: string;
    columns: number;
    rows: number;
    keyCount: number;
    iconSize: number;
    capabilities: {
        brightness: boolean;
        lcd: boolean;
    };
    timestamp: string;
}

interface ConfigStatus {
    status: 'applied' | 'error';
    configHash: string;
    timestamp: string;
    error: string | null;
}

export class MqttHandler extends EventEmitter {
    private client: MqttClient | null = null;
    private config: MqttConfig;

    constructor(config: MqttConfig) {
        super();
        this.config = config;
    }

    connect() {
        const url = `mqtt://${this.config.host}:${this.config.port}`;
        console.log(`Connecting to MQTT broker at ${url}`);

        this.client = mqtt.connect(url, {
            username: this.config.username,
            password: this.config.password
        });

        this.client.on('connect', () => {
            console.log('Connected to MQTT broker');
            // Subscribe to all stream deck discovery and status topics
            this.client?.subscribe('streamdeck/+/discovery');
            this.client?.subscribe('streamdeck/+/status');
            this.client?.subscribe('streamdeck/+/config/status');
        });

        this.client.on('message', (topic, message) => {
            this.handleMessage(topic, message.toString());
        });

        this.client.on('error', (err) => {
            console.error('MQTT error:', err);
        });
    }

    private handleMessage(topic: string, message: string) {
        const parts = topic.split('/');
        if (parts.length < 3 || parts[0] !== 'streamdeck') return;

        const deviceId = parts[1];
        const type = parts[2];

        try {
            if (type === 'discovery') {
                const payload = JSON.parse(message) as DiscoveryPayload;
                this.emit('deviceDiscovered', {
                    id: deviceId,
                    ...payload,
                    lastSeen: new Date().toISOString()
                });
            } else if (type === 'status') {
                this.emit('deviceStatus', deviceId, message);
            } else if (type === 'config' && parts[3] === 'status') {
                const status = JSON.parse(message) as ConfigStatus;
                this.emit('configStatus', deviceId, status);
            }
        } catch (e) {
            console.error('Error parsing MQTT message:', e);
        }
    }

    async deployConfig(deviceId: string, config: any): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.client) {
                reject(new Error('MQTT not connected'));
                return;
            }

            const topic = `streamdeck/${deviceId}/config/set`;
            const payload = JSON.stringify(config);

            this.client.publish(topic, payload, { retain: false }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Config deployed to ${deviceId}`);
                    resolve();
                }
            });
        });
    }

    disconnect() {
        this.client?.end();
    }
}
