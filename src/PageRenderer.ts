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
        const bgColor = buttonConfig.color || '#333333';
        const iconColor = buttonConfig.iconColor || '#ffffff';
        const textColor = buttonConfig.textColor || '#ffffff';

        // Render Icon
        if (buttonConfig.text) {
            const img = await IconManager.getIconJimp(buttonConfig.icon, this.device.ICON_SIZE, bgColor, iconColor);

            // Select font based on text color (Jimp has limited font options, so we use white and tint)
            const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

            const textWidth = Jimp.measureText(font, buttonConfig.text);
            const textHeight = Jimp.measureTextHeight(font, buttonConfig.text, this.device.ICON_SIZE);
            const x = (this.device.ICON_SIZE - textWidth) / 2;
            const y = (this.device.ICON_SIZE - textHeight) / 2;

            // Create a text layer to colorize
            const textLayer = new Jimp(this.device.ICON_SIZE, this.device.ICON_SIZE, 0x00000000);
            textLayer.print(font, x, y, buttonConfig.text);

            // Apply text color by masking
            if (textColor !== '#ffffff') {
                const r = parseInt(textColor.substr(1, 2), 16);
                const g = parseInt(textColor.substr(3, 2), 16);
                const b = parseInt(textColor.substr(5, 2), 16);
                textLayer.scan(0, 0, textLayer.bitmap.width, textLayer.bitmap.height, function(px, py, idx) {
                    if (this.bitmap.data[idx + 3] > 0) { // If pixel is not transparent
                        this.bitmap.data[idx] = r;
                        this.bitmap.data[idx + 1] = g;
                        this.bitmap.data[idx + 2] = b;
                    }
                });
            }

            img.composite(textLayer, 0, 0);
            return IconManager.toRawRgb(img);
        } else if (buttonConfig.icon) {
            return await IconManager.getIconBuffer(buttonConfig.icon, this.device.ICON_SIZE, bgColor, iconColor);
        } else if (bgColor && bgColor.startsWith('#')) {
            // Just background color, no icon or text
            const r = parseInt(bgColor.substr(1, 2), 16);
            const g = parseInt(bgColor.substr(3, 2), 16);
            const b = parseInt(bgColor.substr(5, 2), 16);
            const size = this.device.ICON_SIZE;
            const buffer = Buffer.alloc(size * size * 3);
            for (let i = 0; i < size * size; i++) {
                buffer[i * 3] = r;
                buffer[i * 3 + 1] = g;
                buffer[i * 3 + 2] = b;
            }
            return buffer;
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
