
import path from 'path';
import fs from 'fs';
import { DeviceConfig } from './types';
import defaultConfig from '../config/default';

export class ConfigManager {
    static loadConfig(deviceId: string): DeviceConfig {
        // Run from src (tsx) or dist/src (node)
        // src -> .. -> config
        const configPath = path.resolve(__dirname, `../config/${deviceId}.ts`);
        const jsConfigPath = path.resolve(__dirname, `../config/${deviceId}.js`);

        // Since we are running with tsx in dev, we can import .ts?
        // But dynamic import might be tricky.
        // Let's try to require it if we can.

        // Actually, if we compile to JS, we look for .js.
        // If we run `tsx`, we can require .ts.

        try {
            // Try to dynamic import? Or just standard require.
            // Note: in webpack/bundlers dynamic required is hard. Here in node it's fine.
            if (fs.existsSync(configPath)) {
                console.log(`Loading config from ${configPath}`);
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const userConfig = require(configPath).default || require(configPath);
                return { ...defaultConfig, ...userConfig };
            }
            if (fs.existsSync(jsConfigPath)) {
                console.log(`Loading config from ${jsConfigPath}`);
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const userConfig = require(jsConfigPath).default || require(jsConfigPath);
                return { ...defaultConfig, ...userConfig };
            }
        } catch (e) {
            console.error(`Error loading config for ${deviceId}:`, e);
        }

        console.log('Using default config');
        return defaultConfig;
    }
}
