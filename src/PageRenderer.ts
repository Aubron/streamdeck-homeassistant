import { StreamDeck } from '@elgato-stream-deck/node';
import { PageConfig } from './types';
import { IconManager } from './IconManager';
import Jimp from 'jimp';

export class PageRenderer {
    private device: StreamDeck;
    private cache: Map<string, Map<number, Buffer>> = new Map();

    constructor(device: StreamDeck) {
        this.device = device;
    }

    /**
     * Clear the render cache (call when config changes)
     */
    clearCache() {
        this.cache.clear();
    }

    async prewarm(pages: { [key: string]: any }) {
        console.log('Starting prewarming of pages...');
        const start = Date.now();
        for (const pageName in pages) {
            const pageConfig = pages[pageName];
            const pageCache = new Map<number, Buffer>();

            // Handle both Array and Object configurations
            const buttons = Object.values(pageConfig);

            for (const buttonConfig of buttons) {
                if (!buttonConfig || typeof buttonConfig !== 'object') continue;
                // Cast to any to access key safely if types are loose
                const btn = buttonConfig as any;
                const keyIndex = btn.key;

                if (typeof keyIndex === 'number') {
                    try {
                        const buffer = await this.getKeyBuffer(btn);
                        if (buffer) {
                            pageCache.set(keyIndex, buffer);
                        }
                    } catch (e) {
                        console.error(`Error prewarming key ${keyIndex} on page ${pageName}:`, e);
                    }
                }
            }
            this.cache.set(pageName, pageCache);
        }
        console.log(`Prewarming complete in ${Date.now() - start}ms`);
    }

    private async getKeyBuffer(buttonConfig: any): Promise<Buffer | null> {
        // Render Icon
        if (buttonConfig.text) {
            const img = await IconManager.getIconJimp(buttonConfig.icon, this.device.ICON_SIZE, buttonConfig.color);
            const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

            const textWidth = Jimp.measureText(font, buttonConfig.text);
            const textHeight = Jimp.measureTextHeight(font, buttonConfig.text, this.device.ICON_SIZE);
            const x = (this.device.ICON_SIZE - textWidth) / 2;
            const y = (this.device.ICON_SIZE - textHeight) / 2;

            img.print(font, x, y, buttonConfig.text);
            return IconManager.toRawBgr(img);
        } else if (buttonConfig.icon) {
            return await IconManager.getIconBuffer(buttonConfig.icon, this.device.ICON_SIZE, buttonConfig.color);
        } else if (buttonConfig.color) {
            if (buttonConfig.color.startsWith('#')) {
                // Return a single pixel buffer? Or full size? 
                // fillKeyColor usually takes r,g,b. fillKeyBuffer takes buffer.
                // Let's create a full size buffer of that color
                const r = parseInt(buttonConfig.color.substr(1, 2), 16);
                const g = parseInt(buttonConfig.color.substr(3, 2), 16);
                const b = parseInt(buttonConfig.color.substr(5, 2), 16);
                const size = this.device.ICON_SIZE;
                const buffer = Buffer.alloc(size * size * 3);
                for (let i = 0; i < size * size; i++) {
                    buffer[i * 3] = b;
                    buffer[i * 3 + 1] = g;
                    buffer[i * 3 + 2] = r;
                }
                return buffer;
            }
        }
        return null;
    }

    async renderPage(pageConfig: PageConfig, pageName?: string) {
        try {
            // clearAllKeys might no longer exist in types
            for (let i = 0; i < this.device.NUM_KEYS; i++) {
                await this.device.clearKey(i);
            }
        } catch (e) {
            // clear might fail on some devices if not ready, retry or ignore
        }

        const pageCache = pageName ? this.cache.get(pageName) : undefined;

        const buttons = Object.values(pageConfig);

        for (const buttonConfig of buttons) {
            if (!buttonConfig) continue;
            const btn = buttonConfig as any; // Cast to avoid index signature issues if needed
            const keyIndex = btn.key;

            if (typeof keyIndex === 'number') {
                try {
                    let buffer: Buffer | null = null;

                    // Try cache first
                    if (pageCache && pageCache.has(keyIndex)) {
                        buffer = pageCache.get(keyIndex)!;
                    } else {
                        // Render on demand
                        buffer = await this.getKeyBuffer(buttonConfig);
                    }

                    if (buffer) {
                        await this.device.fillKeyBuffer(keyIndex, buffer);
                    }
                    // Fallback for color if not buffered logic (backward compat, though removed above)
                    // If getKeyBuffer returned null but color existed, we might have skipped it?
                    // My getKeyBuffer handles color now, so we are good.

                } catch (e) {
                    console.error(`Error rendering key ${keyIndex}:`, e);
                }
            }
        }
    }
}
