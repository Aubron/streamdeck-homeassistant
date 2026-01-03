import { StreamDeck } from '@elgato-stream-deck/node';
import { PageConfig } from './types';
import { IconManager } from './IconManager';
import Jimp from 'jimp';

export class PageRenderer {
    private device: StreamDeck;

    constructor(device: StreamDeck) {
        this.device = device;
    }

    async renderPage(pageConfig: PageConfig) {
        try {
            // clearAllKeys might no longer exist in types
            for (let i = 0; i < this.device.NUM_KEYS; i++) {
                await this.device.clearKey(i);
            }
        } catch (e) {
            // clear might fail on some devices if not ready, retry or ignore
        }


        // Iterate through all defined keys in the page
        for (const keyStr in pageConfig) {
            const keyIndex = parseInt(keyStr);
            const buttonConfig = pageConfig[keyIndex];

            if (buttonConfig) {
                try {
                    // Render Icon
                    if (buttonConfig.icon) {
                        const buffer = await IconManager.getIconBuffer(buttonConfig.icon, this.device.ICON_SIZE, buttonConfig.color);
                        await this.device.fillKeyBuffer(keyIndex, buffer);
                    } else if (buttonConfig.color) {
                        // Hex string validation?
                        if (buttonConfig.color.startsWith('#')) {
                            const r = parseInt(buttonConfig.color.substr(1, 2), 16);
                            const g = parseInt(buttonConfig.color.substr(3, 2), 16);
                            const b = parseInt(buttonConfig.color.substr(5, 2), 16);
                            await this.device.fillKeyColor(keyIndex, r, g, b);
                        }
                    }

                    // Render Text (Overlay?)
                    // If both icon and text are present, we need to composite.
                    // IconManager currently returns buffer. 
                    // Let's assume for now valid configs have icon OR color.
                    // Text needs to be drawn on top.
                    // If we want text, we probably should have requested a Jimp object from IconManager, 
                    // drawn text on it, then got buffer.

                    if (buttonConfig.text) {
                        // Re-load image as Jimp to draw text? 
                        // Optimization: IconManager should perhaps support text, or we do compositing here.
                        // Let's use IconManager.getIconJimp()

                        const img = await IconManager.getIconJimp(buttonConfig.icon, this.device.ICON_SIZE, buttonConfig.color);

                        const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE); // Or larger
                        // Center text
                        const textWidth = Jimp.measureText(font, buttonConfig.text);
                        const textHeight = Jimp.measureTextHeight(font, buttonConfig.text, this.device.ICON_SIZE);
                        const x = (this.device.ICON_SIZE - textWidth) / 2;
                        const y = (this.device.ICON_SIZE - textHeight) / 2; // Middle? Or bottom?

                        // Maybe bottom for text if icon is present?
                        // Let's center for now.
                        img.print(font, x, y, buttonConfig.text);

                        const buffer = await img.getBufferAsync(Jimp.MIME_PNG);
                        await this.device.fillKeyBuffer(keyIndex, buffer);
                    }

                } catch (e) {
                    console.error(`Error rendering key ${keyIndex}:`, e);
                }
            }
        }
    }
}
