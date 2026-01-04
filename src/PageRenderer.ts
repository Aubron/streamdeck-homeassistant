import { StreamDeck } from '@elgato-stream-deck/node';
import { PageConfig, ButtonConfig } from './types';
import { IconManager } from './IconManager';
import { createHash } from 'crypto';
import Jimp from 'jimp';

export class PageRenderer {
    private device: StreamDeck;
    // Hash-based cache: hash of rendering attributes → rendered buffer
    private cache: Map<string, Buffer> = new Map();

    constructor(device: StreamDeck) {
        this.device = device;
    }

    /**
     * Generate a hash key for a button's rendering configuration.
     * This hash uniquely identifies how a button will look based on all
     * attributes that affect its visual appearance.
     */
    private getButtonHash(buttonConfig: ButtonConfig): string {
        // Include all properties that affect rendering
        const hashInput = {
            text: buttonConfig.text || '',
            icon: buttonConfig.icon || '',
            color: buttonConfig.color || '#333333',
            iconColor: buttonConfig.iconColor || '#ffffff',
            textColor: buttonConfig.textColor || '#ffffff',
            // Include device icon size since it affects the rendered output
            size: this.device.ICON_SIZE,
        };
        return createHash('md5').update(JSON.stringify(hashInput)).digest('hex');
    }

    /**
     * Get cache statistics for debugging/monitoring
     */
    getCacheStats(): { size: number } {
        return { size: this.cache.size };
    }

    /**
     * Get a rendered buffer for a button configuration.
     * Uses hash-based caching to avoid re-rendering identical configurations.
     */
    private async getKeyBuffer(buttonConfig: ButtonConfig): Promise<Buffer | null> {
        const hash = this.getButtonHash(buttonConfig);

        // Check cache first
        const cached = this.cache.get(hash);
        if (cached) {
            return cached;
        }

        // Render the button
        const buffer = await this.renderButton(buttonConfig);

        // Cache the result if we got a valid buffer
        if (buffer) {
            this.cache.set(hash, buffer);
        }

        return buffer;
    }

    /**
     * Internal method to actually render a button to a buffer.
     * This is called when the cache doesn't have the rendered image.
     */
    private async renderButton(buttonConfig: ButtonConfig): Promise<Buffer | null> {
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

    /**
     * Render a page to the Stream Deck.
     * Uses hash-based caching internally - identical button configurations
     * across any page will share the same cached buffer.
     */
    async renderPage(pageConfig: PageConfig, pageName?: string) {
        try {
            for (let i = 0; i < this.device.NUM_KEYS; i++) {
                await this.device.clearKey(i);
            }
        } catch (e) {
            // clear might fail on some devices if not ready, ignore
        }

        const buttons = Object.values(pageConfig);

        for (const buttonConfig of buttons) {
            if (!buttonConfig) continue;
            const btn = buttonConfig as ButtonConfig;
            const keyIndex = btn.key;

            if (typeof keyIndex === 'number') {
                try {
                    // getKeyBuffer handles caching internally via hash
                    const buffer = await this.getKeyBuffer(btn);

                    if (buffer) {
                        await this.device.fillKeyBuffer(keyIndex, buffer);
                    }
                } catch (e) {
                    console.error(`Error rendering key ${keyIndex}:`, e);
                }
            }
        }
    }
}
