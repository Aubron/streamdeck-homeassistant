import fs from 'fs';
import path from 'path';
import { DeviceConfig } from './types';

const CONFIG_DIR = path.resolve(__dirname, '../config');
const CACHE_FILE = path.join(CONFIG_DIR, 'cached.json');

export class ConfigManager {
    /**
     * Load cached config from JSON file
     * Returns null if no cache exists
     */
    static getCachedConfig(): DeviceConfig | null {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                const data = fs.readFileSync(CACHE_FILE, 'utf-8');
                const config = JSON.parse(data) as DeviceConfig;
                console.log('Loaded cached config from', CACHE_FILE);
                return config;
            }
        } catch (e) {
            console.error('Error loading cached config:', e);
        }
        return null;
    }

    /**
     * Save config to cache file for startup reliability
     */
    static saveConfig(config: DeviceConfig): void {
        try {
            // Ensure config directory exists
            if (!fs.existsSync(CONFIG_DIR)) {
                fs.mkdirSync(CONFIG_DIR, { recursive: true });
            }
            fs.writeFileSync(CACHE_FILE, JSON.stringify(config, null, 2));
            console.log('Saved config to cache:', CACHE_FILE);
        } catch (e) {
            console.error('Error saving config to cache:', e);
        }
    }

    /**
     * Check if a cached config exists
     */
    static hasCachedConfig(): boolean {
        return fs.existsSync(CACHE_FILE);
    }
}
