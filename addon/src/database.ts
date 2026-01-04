import fs from 'fs';
import path from 'path';

interface Device {
    id: string;
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
    status: 'online' | 'offline' | 'unknown';
    lastSeen: string;
}

interface DeviceConfig {
    brightness?: number;
    pages: {
        [pageName: string]: Array<{
            key: number;
            text?: string;
            icon?: string;
            color?: string;
            action?: any;
        }>;
    };
}

interface DatabaseData {
    devices: { [id: string]: Device };
    configs: { [id: string]: DeviceConfig };
}

export class Database {
    private filePath: string;
    private data: DatabaseData;

    constructor(filePath: string) {
        this.filePath = filePath;
        this.data = this.load();
    }

    private load(): DatabaseData {
        try {
            if (fs.existsSync(this.filePath)) {
                const content = fs.readFileSync(this.filePath, 'utf-8');
                return JSON.parse(content);
            }
        } catch (e) {
            console.error('Error loading database:', e);
        }
        return { devices: {}, configs: {} };
    }

    private save() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error('Error saving database:', e);
        }
    }

    getDevices(): Device[] {
        return Object.values(this.data.devices);
    }

    getDevice(id: string): Device | undefined {
        return this.data.devices[id];
    }

    updateDevice(device: Omit<Device, 'status'> & { status?: string }) {
        const existing = this.data.devices[device.id];
        this.data.devices[device.id] = {
            ...device,
            status: (device.status as Device['status']) || existing?.status || 'unknown'
        };
        this.save();
    }

    updateDeviceStatus(id: string, status: string) {
        if (this.data.devices[id]) {
            this.data.devices[id].status = status as Device['status'];
            this.data.devices[id].lastSeen = new Date().toISOString();
            this.save();
        }
    }

    getDeviceConfig(id: string): DeviceConfig | undefined {
        return this.data.configs[id];
    }

    saveDeviceConfig(id: string, config: DeviceConfig) {
        this.data.configs[id] = config;
        this.save();
    }

    resetDeviceConfig(id: string): DeviceConfig {
        const defaultConfig: DeviceConfig = {
            brightness: 80,
            pages: { default: [] }
        };
        this.data.configs[id] = defaultConfig;
        this.save();
        return defaultConfig;
    }
}
