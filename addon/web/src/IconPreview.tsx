import * as PhosphorIcons from '@phosphor-icons/react';
import { IconProps } from '@phosphor-icons/react';
import { ComponentType, useMemo } from 'react';

interface IconPreviewProps {
    icon?: string;
    iconColor?: string;
    size?: number;
}

// Convert kebab-case to PascalCase: "arrow-left" -> "ArrowLeft"
function kebabToPascal(str: string): string {
    return str
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}

// Get Phosphor icon component by name
function getPhosphorIcon(name: string): ComponentType<IconProps> | null {
    const pascalName = kebabToPascal(name);
    const icons = PhosphorIcons as Record<string, ComponentType<IconProps>>;
    return icons[pascalName] || null;
}

export default function IconPreview({ icon, iconColor = '#ffffff', size = 40 }: IconPreviewProps) {
    const renderContent = useMemo(() => {
        if (!icon) {
            return null;
        }

        // Phosphor icon: ph:icon-name
        if (icon.startsWith('ph:')) {
            const iconName = icon.replace(/^ph:/, '');
            const IconComponent = getPhosphorIcon(iconName);

            if (IconComponent) {
                return (
                    <IconComponent
                        size={size}
                        color={iconColor}
                        weight="regular"
                    />
                );
            }
            // Fallback: show icon name if not found
            return <span className="text-[8px] opacity-50">{iconName}</span>;
        }

        // Hex color: #RRGGBB - show a colored square
        if (icon.startsWith('#')) {
            return (
                <div
                    style={{
                        backgroundColor: icon,
                        width: size * 0.7,
                        height: size * 0.7,
                        borderRadius: 4
                    }}
                />
            );
        }

        // HTTP/HTTPS URL: show image
        if (icon.startsWith('http://') || icon.startsWith('https://')) {
            return (
                <img
                    src={icon}
                    alt="icon"
                    style={{
                        width: size,
                        height: size,
                        objectFit: 'contain'
                    }}
                    onError={(e) => {
                        // Hide broken images
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            );
        }

        // Local file reference - can't preview in web UI
        if (icon.startsWith('local:')) {
            return <span className="text-[8px] opacity-50">local</span>;
        }

        // Unknown format - show text
        return <span className="text-[8px] opacity-50 truncate max-w-full">{icon}</span>;
    }, [icon, iconColor, size]);

    return (
        <div className="flex items-center justify-center w-full h-full">
            {renderContent}
        </div>
    );
}
