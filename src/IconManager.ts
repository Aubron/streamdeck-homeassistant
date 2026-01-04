import Jimp from 'jimp';
import { Resvg } from '@resvg/resvg-js';
import path from 'path';
import * as PhosphorIcons from '@phosphor-icons/core';

// Helper to find icon path
function getPhosphorIconPath(name: string): string | null {
    const cleanName = name.replace(/^ph:/, '').toLowerCase();
    const iconPath = path.resolve(process.cwd(), 'node_modules/@phosphor-icons/core/assets/regular', `${cleanName}.svg`);
    return iconPath;
}

export class IconManager {
    static async getIconBuffer(icon: string, size: number, bgColor: string = '#000000', iconColor: string = '#ffffff'): Promise<Buffer> {
        // Reuse getIconJimp to get the image instance
        const image = await IconManager.getIconJimp(icon, size, bgColor, iconColor);
        return IconManager.toRawRgb(image);
    }

    static toRawRgb(image: Jimp): Buffer {
        // Convert RGBA to Raw RGB for Stream Deck
        // The @elgato-stream-deck/node library expects RGB format for fillKeyBuffer

        const { data, width } = image.bitmap;
        const size = width; // Assuming Jimp image is square for icons
        const rawBuffer = Buffer.alloc(size * size * 3);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const srcIdx = (y * width + x) * 4;
                const destIdx = (y * size + x) * 3;

                // RGB mapping from RGBA
                rawBuffer[destIdx] = data[srcIdx];         // R
                rawBuffer[destIdx + 1] = data[srcIdx + 1]; // G
                rawBuffer[destIdx + 2] = data[srcIdx + 2]; // B
            }
        }

        return rawBuffer;
    }

    // Helper to get Jimp instance directly
    static async getIconJimp(icon: string | undefined, size: number, bgColor: string = '#000000', iconColor: string = '#ffffff'): Promise<Jimp> {
        if (!icon) {
            return new Jimp(size, size, bgColor);
        }

        let jimpImage: Jimp;

        if (icon.startsWith('#')) {
            return new Jimp(size, size, icon);
        }
        else if (icon.startsWith('ph:')) {
            const svgPath = getPhosphorIconPath(icon);
            if (svgPath && require('fs').existsSync(svgPath)) {
                const fs = require('fs');
                let svg = fs.readFileSync(svgPath, 'utf8');

                // Colorize with provided iconColor
                if (svg.includes('fill="')) {
                    svg = svg.replace(/fill="[^"]*"/g, `fill="${iconColor}"`);
                } else {
                    svg = svg.replace('<svg', `<svg fill="${iconColor}" `);
                }

                const resvg = new Resvg(svg, {
                    fitTo: { mode: 'width', value: size }
                });
                const pngData = resvg.render();
                const pngBuffer = pngData.asPng();

                jimpImage = await Jimp.read(pngBuffer);
            } else {
                console.warn(`Icon ${icon} not found, using placeholder`);
                jimpImage = new Jimp(size, size, bgColor);
            }
        }
        else if (icon.startsWith('local:')) {
            const localPath = icon.replace(/^local:/, '');
            const fullPath = path.resolve(__dirname, '../assets', localPath);
            try {
                jimpImage = await Jimp.read(fullPath);
            } catch (e) {
                console.error(`Error loading ${fullPath}`, e);
                jimpImage = new Jimp(size, size, bgColor);
            }
        }
        else if (icon.startsWith('http')) {
            try {
                jimpImage = await Jimp.read(icon);
            } catch (e) {
                console.error(`Error loading remote icon ${icon}`, e);
                jimpImage = new Jimp(size, size, bgColor);
            }
        }
        else {
            jimpImage = new Jimp(size, size, bgColor);
        }

        // Use cover mode: resize to fill the area while maintaining aspect ratio, then center crop
        // This prevents non-square images from being stretched/skewed
        jimpImage.cover(size, size);

        // If we want to composite over background color (for PNGs/SVGs with transparency)
        if (bgColor) {
            const bg = new Jimp(size, size, bgColor);
            bg.composite(jimpImage, 0, 0);
            return bg;
        }

        return jimpImage;
    }
}
