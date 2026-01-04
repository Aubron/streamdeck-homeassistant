import { StreamDeck } from '@elgato-stream-deck/node';
import { PageConfig, ButtonConfig, EntityState } from './types';
import { IconManager } from './IconManager';
import { createHash } from 'crypto';
import Jimp from 'jimp';
import { StateManager, computeLightStyle } from './StateManager';

export class PageRenderer {
    private device: StreamDeck;
    // Hash-based cache: hash of rendering attributes → rendered buffer
    private cache: Map<string, Buffer> = new Map();
    private stateManager: StateManager | null = null;

    constructor(device: StreamDeck) {
        this.device = device;
    }

    setStateManager(stateManager: StateManager) {
        this.stateManager = stateManager;
    }

    /**
     * Get effective button config after applying entity state styling
     */
    private getEffectiveConfig(buttonConfig: ButtonConfig): ButtonConfig {
        if (!buttonConfig.useEntityState || !this.stateManager) {
            return buttonConfig;
        }

        // Determine which entity to track
        const entityId = buttonConfig.stateEntity ||
            (buttonConfig.action?.type === 'ha' ? buttonConfig.action.entityId : undefined);

        if (!entityId) {
            return buttonConfig;
        }

        const state = this.stateManager.getState(entityId);

        // Determine entity domain for appropriate styling
        const domain = entityId.split('.')[0];

        if (domain === 'light') {
            const style = computeLightStyle(state, buttonConfig);
            return {
                ...buttonConfig,
                color: style.color,
                iconColor: style.iconColor,
                textColor: style.textColor,
                icon: style.icon
            };
        }

        // For other domains, just show basic on/off styling
        if (state && state.state === 'on') {
            return {
                ...buttonConfig,
                color: buttonConfig.color || '#1a5f1a', // Green-ish for on
                iconColor: '#ffffff',
                textColor: '#ffffff'
            };
        } else {
            return {
                ...buttonConfig,
                color: '#1a1a1a',
                iconColor: '#666666',
                textColor: '#888888'
            };
        }
    }

    /**
     * Generate a hash key for a button's rendering configuration.
     * This hash uniquely identifies how a button will look based on all
     * attributes that affect its visual appearance.
     */
    private getButtonHash(buttonConfig: ButtonConfig, effectiveConfig: ButtonConfig): string {
        // Include all properties that affect rendering (use effective config for actual visual attributes)
        const hashInput = {
            text: effectiveConfig.text || '',
            icon: effectiveConfig.icon || '',
            color: effectiveConfig.color || '#333333',
            iconColor: effectiveConfig.iconColor || '#ffffff',
            textColor: effectiveConfig.textColor || '#ffffff',
            titleAlign: effectiveConfig.titleAlign || 'middle',
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
        // Get effective config after applying entity state
        const effectiveConfig = this.getEffectiveConfig(buttonConfig);
        const hash = this.getButtonHash(buttonConfig, effectiveConfig);

        // Check cache first
        const cached = this.cache.get(hash);
        if (cached) {
            return cached;
        }

        // Render the button using effective config
        const buffer = await this.renderButtonToBuffer(effectiveConfig);

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
    private async renderButtonToBuffer(buttonConfig: ButtonConfig): Promise<Buffer | null> {
        const bgColor = buttonConfig.color || '#333333';
        const iconColor = buttonConfig.iconColor || '#ffffff';
        const textColor = buttonConfig.textColor || '#ffffff';

        // Render Icon
        if (buttonConfig.text) {
            const img = await IconManager.getIconJimp(buttonConfig.icon, this.device.ICON_SIZE, bgColor, iconColor);

            // Select font based on text color (Jimp has limited font options, so we use white and tint)
            const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

            const padding = 4; // Padding from edges
            const maxWidth = this.device.ICON_SIZE - (padding * 2);

            // Measure text height with wrapping
            const textHeight = Jimp.measureTextHeight(font, buttonConfig.text, maxWidth);

            // Calculate Y position based on alignment
            const titleAlign = buttonConfig.titleAlign || 'middle';
            let y: number;
            switch (titleAlign) {
                case 'top':
                    y = padding;
                    break;
                case 'bottom':
                    y = this.device.ICON_SIZE - textHeight - padding;
                    break;
                case 'middle':
                default:
                    y = (this.device.ICON_SIZE - textHeight) / 2;
                    break;
            }

            // Create a text layer to colorize
            const textLayer = new Jimp(this.device.ICON_SIZE, this.device.ICON_SIZE, 0x00000000);

            // Print with wrapping and horizontal centering
            textLayer.print(
                font,
                padding,
                y,
                {
                    text: buttonConfig.text,
                    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                    alignmentY: Jimp.VERTICAL_ALIGN_TOP
                },
                maxWidth,
                this.device.ICON_SIZE
            );

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
     * Render a single key to the Stream Deck.
     * Used when entity state changes require updating specific buttons.
     */
    async renderKey(keyIndex: number, buttonConfig: ButtonConfig): Promise<void> {
        try {
            const buffer = await this.getKeyBuffer(buttonConfig);
            if (buffer) {
                await this.device.fillKeyBuffer(keyIndex, buffer);
            }
        } catch (e) {
            console.error(`Error rendering key ${keyIndex}:`, e);
        }
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
