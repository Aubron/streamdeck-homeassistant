import { ComponentType, useState, useEffect, useMemo } from 'react';
import type { IconProps } from '@phosphor-icons/react';

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

// Cache for loaded icon components
const iconCache = new Map<string, ComponentType<IconProps>>();

// Dynamic icon loader
function usePhosphorIcon(iconName: string | null): ComponentType<IconProps> | null {
    const [IconComponent, setIconComponent] = useState<ComponentType<IconProps> | null>(
        iconName ? iconCache.get(iconName) || null : null
    );

    useEffect(() => {
        if (!iconName) {
            setIconComponent(null);
            return;
        }

        // Check cache first
        const cached = iconCache.get(iconName);
        if (cached) {
            setIconComponent(cached);
            return;
        }

        // Dynamic import
        const pascalName = kebabToPascal(iconName);
        import('@phosphor-icons/react')
            .then((module) => {
                const Icon = (module as Record<string, ComponentType<IconProps>>)[pascalName];
                if (Icon) {
                    iconCache.set(iconName, Icon);
                    setIconComponent(Icon);
                }
            })
            .catch(() => {
                // Icon not found, ignore
            });
    }, [iconName]);

    return IconComponent;
}

export default function IconPreview({ icon, iconColor = '#ffffff', size = 40 }: IconPreviewProps) {
    // Extract phosphor icon name if applicable
    const phosphorIconName = useMemo(() => {
        if (icon?.startsWith('ph:')) {
            return icon.replace(/^ph:/, '');
        }
        return null;
    }, [icon]);

    const IconComponent = usePhosphorIcon(phosphorIconName);

    const renderContent = useMemo(() => {
        if (!icon) {
            return null;
        }

        // Phosphor icon: ph:icon-name
        if (icon.startsWith('ph:')) {
            if (IconComponent) {
                return (
                    <IconComponent
                        size={size}
                        color={iconColor}
                        weight="regular"
                    />
                );
            }
            // Loading or not found - show placeholder
            return (
                <div
                    style={{ width: size, height: size }}
                    className="animate-pulse bg-white/10 rounded"
                />
            );
        }

        // HTTP/HTTPS URL or data: URL: show image
        if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:')) {
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
    }, [icon, iconColor, size, IconComponent]);

    return (
        <div className="flex items-center justify-center w-full h-full">
            {renderContent}
        </div>
    );
}
