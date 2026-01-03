import Jimp from 'jimp';
import { Resvg } from '@resvg/resvg-js';
import path from 'path';
import * as PhosphorIcons from '@phosphor-icons/core';

// Map of icon names to definitions (Phosphor icons)
// The core package exports raw data/functions usually.
// Let's verify how to get SVG string.
// PhosphorIcons.icons is a list? Or object?
// Based on docs, it exports `icons` which is a list of IconEntry.
// We might need to map them for O(1) access.

// Helper to find icon path
function getPhosphorIconPath(name: string): string | null {
    const cleanName = name.replace(/^ph:/, '').toLowerCase();

    // We expect node_modules to be reachable. 
    // In Docker execution, node_modules is in /usr/src/app/node_modules
    // Code is in /usr/src/app/src (or dist)
    // Common path:
    const iconPath = path.resolve(process.cwd(), 'node_modules/@phosphor-icons/core/assets/regular', `${cleanName}.svg`);

    return iconPath;
}

export class IconManager {
    static async getIconBuffer(icon: string, size: number, color: string = '#000000'): Promise<Buffer> {
        // 1. Color fill
        if (icon.startsWith('#')) {
            const image = new Jimp(size, size, icon);
            return image.getBufferAsync(Jimp.MIME_BMP); // Streamdeck often likes BGR/BMP/JPEG. Index.ts used raw buffer conversion.
            // We should stick to returning Jimp image or Buffer and let index.ts handle BGR conversion if needed,
            // OR handle it here.
            // Original code did manual BGR conversion for 'http'.
            // Let's return a Jimp instance to be consistent/flexible? 
            // Or return { type: 'buffer', data: ... }
            // Let's return a Promise<Jimp> to keep it easy to resize/process.
        }

        // 2. Phosphor Icon
        if (icon.startsWith('ph:')) {
            const svgPath = getPhosphorIconPath(icon);
            try {
                if (svgPath && require('fs').existsSync(svgPath)) {
                    const fs = require('fs');
                    let svg = fs.readFileSync(svgPath, 'utf8');

                    // Colorize: replace <svg ...> with <svg fill="..." ...>
                    // Phosphor SVGs usually don't have fill (default black) or current.
                    // It's safer to add a style or fill attribute.
                    // The simple replace might work if <svg tag doesn't already have fill.
                    // Defaulting to white for Stream Deck if no color specified?
                    // Plan said "color" argument is '#000000' default. 
                    // But for icons on dark bg, we want white.
                    // Let's assume white if color is black (default bg)? Or just use passed color?
                    // Passed color is for background in getIconJimp? 
                    // Let's force white icon for now as typical.

                    svg = svg.replace('<svg', `<svg fill="#ffffff" `);

                    const resvg = new Resvg(svg, {
                        fitTo: { mode: 'width', value: size }
                    });
                    const pngData = resvg.render();
                    const pngBuffer = pngData.asPng();

                    const image = await Jimp.read(pngBuffer);
                    return image.getBufferAsync(Jimp.MIME_PNG);
                } else {
                    console.warn(`Icon path not found: ${svgPath}`);
                }
            } catch (e) {
                console.error(`Error loading phosphor icon ${icon}:`, e);
            }
        }

        // 3. Local File
        if (icon.startsWith('local:')) {
            const localPath = icon.replace(/^local:/, '');
            const fullPath = path.isAbsolute(localPath) ? localPath : path.join(__dirname, '../assets', localPath);
            // Check if file exists? Jimp.read throws if not.
            try {
                const image = await Jimp.read(fullPath);
                image.resize(size, size);
                return image.getBufferAsync(Jimp.MIME_PNG);
            } catch (e) {
                console.error(`Failed to load local icon: ${fullPath}`, e);
            }
        }

        // Fallback: Black square
        const image = new Jimp(size, size, 0x000000FF);
        return image.getBufferAsync(Jimp.MIME_PNG);
    }

    // Helper to get Jimp instance directly
    static async getIconJimp(icon: string | undefined, size: number, bgColor: string = '#000000'): Promise<Jimp> {
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

                const coloredSvg = svg.replace('<svg', `<svg fill="#ffffff" `);

                const resvg = new Resvg(coloredSvg, {
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
            // Resolve relative config/assets or absolute
            // For now assume relative to dist/src/../assets -> assets in root
            const fullPath = path.resolve(__dirname, '../assets', localPath);
            try {
                jimpImage = await Jimp.read(fullPath);
            } catch (e) {
                console.error(`Error loading ${fullPath}`, e);
                jimpImage = new Jimp(size, size, bgColor);
            }
        } else {
            jimpImage = new Jimp(size, size, bgColor);
        }

        jimpImage.resize(size, size);

        // If we want to composite over background color (for PNGs/SVGs with transparency)
        if (bgColor) {
            const bg = new Jimp(size, size, bgColor);
            bg.composite(jimpImage, 0, 0);
            return bg;
        }

        return jimpImage;
    }
}
