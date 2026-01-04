import { useState, useMemo } from 'react';
import * as PhosphorIcons from '@phosphor-icons/react';
import { IconProps } from '@phosphor-icons/react';
import { ComponentType } from 'react';

interface IconPickerProps {
    value?: string;
    iconColor?: string;
    onChange: (value: string) => void;
}

// Common icons for quick access - organized by category
const COMMON_ICONS = [
    // Home & Automation
    'house', 'house-line', 'door', 'door-open', 'key', 'lock', 'lock-open',
    'lightbulb', 'lightbulb-filament', 'lamp', 'fan', 'thermometer', 'thermometer-simple',
    'sun', 'moon', 'cloud', 'cloud-sun', 'cloud-moon', 'snowflake', 'drop',
    // Media & Entertainment
    'play', 'pause', 'stop', 'skip-forward', 'skip-back', 'rewind', 'fast-forward',
    'speaker-high', 'speaker-low', 'speaker-x', 'speaker-none', 'microphone', 'microphone-slash',
    'music-notes', 'music-note', 'radio', 'television', 'monitor', 'desktop',
    'spotify-logo', 'youtube-logo', 'apple-logo',
    // Controls & UI
    'power', 'gear', 'sliders', 'sliders-horizontal', 'faders', 'faders-horizontal',
    'arrows-clockwise', 'arrow-clockwise', 'arrow-counter-clockwise',
    'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right',
    'caret-up', 'caret-down', 'caret-left', 'caret-right',
    'plus', 'minus', 'x', 'check', 'check-circle',
    // Navigation & Views
    'house', 'squares-four', 'grid-four', 'list', 'rows', 'columns',
    'sidebar', 'layout', 'browsers', 'tabs',
    // Devices & Hardware
    'device-mobile', 'device-tablet', 'laptop', 'computer-tower',
    'keyboard', 'mouse', 'game-controller', 'headphones',
    'camera', 'video-camera', 'webcam',
    'printer', 'usb', 'bluetooth', 'wifi-high', 'wifi-medium', 'wifi-low', 'wifi-slash',
    // People & Communication
    'user', 'users', 'user-circle', 'bell', 'bell-slash', 'chat', 'envelope',
    'phone', 'phone-call', 'video',
    // Security & Alerts
    'shield', 'shield-check', 'warning', 'warning-circle', 'info', 'question',
    'eye', 'eye-slash', 'scan',
    // Time & Calendar
    'clock', 'timer', 'alarm', 'calendar', 'calendar-blank',
    // Files & Storage
    'folder', 'folder-open', 'file', 'files', 'database', 'hard-drive',
    // Actions
    'trash', 'pencil', 'copy', 'clipboard', 'download', 'upload', 'share',
    'magnifying-glass', 'funnel', 'sort-ascending', 'sort-descending',
    // Misc
    'star', 'heart', 'flag', 'bookmark', 'tag', 'hash', 'at',
    'lightning', 'battery-full', 'battery-half', 'battery-low', 'battery-empty',
    'plug', 'plugs', 'car', 'garage',
];

// Convert kebab-case to PascalCase
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

// Get all available Phosphor icon names
function getAllIconNames(): string[] {
    const icons = PhosphorIcons as Record<string, unknown>;
    return Object.keys(icons)
        .filter(key => {
            // Filter out non-icon exports (like IconContext, IconWeight, etc.)
            return typeof icons[key] === 'function' &&
                   key[0] === key[0].toUpperCase() &&
                   !key.includes('Context') &&
                   !key.includes('Weight');
        })
        .map(pascalName => {
            // Convert PascalCase to kebab-case
            return pascalName
                .replace(/([a-z])([A-Z])/g, '$1-$2')
                .toLowerCase();
        });
}

type TabType = 'icons' | 'image';

export default function IconPicker({ value, iconColor = '#ffffff', onChange }: IconPickerProps) {
    const [activeTab, setActiveTab] = useState<TabType>(() => {
        if (!value) return 'icons';
        if (value.startsWith('ph:')) return 'icons';
        return 'image';
    });
    const [search, setSearch] = useState('');
    const [showAllIcons, setShowAllIcons] = useState(false);

    // Get current icon name if it's a Phosphor icon
    const currentIconName = value?.startsWith('ph:') ? value.replace('ph:', '') : '';

    // Filter icons based on search
    const filteredIcons = useMemo(() => {
        const sourceIcons = showAllIcons ? getAllIconNames() : COMMON_ICONS;
        if (!search.trim()) return sourceIcons;
        const searchLower = search.toLowerCase();
        return sourceIcons.filter(name => name.includes(searchLower));
    }, [search, showAllIcons]);

    const handleIconSelect = (iconName: string) => {
        onChange(`ph:${iconName}`);
    };

    const handleImageUrlChange = (url: string) => {
        onChange(url);
    };

    const currentImageUrl = value && !value.startsWith('ph:') && !value.startsWith('local:') ? value : '';

    return (
        <div className="space-y-3">
            {/* Tabs */}
            <div className="flex gap-1 bg-surface-800 p-1 rounded-lg">
                <button
                    type="button"
                    onClick={() => setActiveTab('icons')}
                    className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        activeTab === 'icons'
                            ? 'bg-surface-600 text-surface-100'
                            : 'text-surface-400 hover:text-surface-200'
                    }`}
                >
                    Phosphor Icons
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('image')}
                    className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        activeTab === 'image'
                            ? 'bg-surface-600 text-surface-100'
                            : 'text-surface-400 hover:text-surface-200'
                    }`}
                >
                    Image URL
                </button>
            </div>

            {/* Icon Tab */}
            {activeTab === 'icons' && (
                <div className="space-y-3">
                    {/* Search */}
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search icons..."
                        className="w-full px-3 py-2"
                    />

                    {/* Toggle all icons */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-surface-500">
                            {showAllIcons ? 'All icons' : 'Common icons'}
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowAllIcons(!showAllIcons)}
                            className="text-xs text-primary-400 hover:text-primary-300"
                        >
                            {showAllIcons ? 'Show common only' : 'Show all icons'}
                        </button>
                    </div>

                    {/* Icon Grid */}
                    <div className="max-h-64 overflow-y-auto bg-surface-900 rounded-lg p-2">
                        <div className="grid grid-cols-8 gap-1">
                            {filteredIcons.slice(0, 200).map(iconName => {
                                const IconComponent = getPhosphorIcon(iconName);
                                const isSelected = currentIconName === iconName;

                                if (!IconComponent) return null;

                                return (
                                    <button
                                        key={iconName}
                                        type="button"
                                        onClick={() => handleIconSelect(iconName)}
                                        title={iconName}
                                        className={`
                                            w-8 h-8 flex items-center justify-center rounded
                                            transition-colors
                                            ${isSelected
                                                ? 'bg-primary-500 text-white'
                                                : 'bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-surface-100'
                                            }
                                        `}
                                    >
                                        <IconComponent size={18} weight="regular" />
                                    </button>
                                );
                            })}
                        </div>
                        {filteredIcons.length > 200 && (
                            <p className="text-xs text-surface-500 mt-2 text-center">
                                Showing 200 of {filteredIcons.length} icons. Refine your search to see more.
                            </p>
                        )}
                        {filteredIcons.length === 0 && (
                            <p className="text-sm text-surface-500 text-center py-4">
                                No icons found
                            </p>
                        )}
                    </div>

                    {/* Current Selection */}
                    {currentIconName && (
                        <div className="flex items-center gap-2 bg-surface-800 rounded-lg px-3 py-2">
                            <span className="text-xs text-surface-500">Selected:</span>
                            <span className="text-sm text-surface-200 font-mono">{currentIconName}</span>
                            <button
                                type="button"
                                onClick={() => onChange('')}
                                className="ml-auto text-xs text-surface-500 hover:text-surface-300"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Image Tab */}
            {activeTab === 'image' && (
                <div className="space-y-3">
                    <input
                        type="text"
                        value={currentImageUrl}
                        onChange={e => handleImageUrlChange(e.target.value)}
                        placeholder="https://example.com/image.png"
                        className="w-full px-3 py-2"
                    />
                    <p className="text-xs text-surface-500">
                        Enter a URL to an image (PNG, JPG, SVG, etc.)
                    </p>

                    {/* Preview */}
                    {currentImageUrl && (
                        <div className="flex items-center gap-3 bg-surface-800 rounded-lg p-3">
                            <div className="w-12 h-12 bg-surface-900 rounded flex items-center justify-center overflow-hidden">
                                <img
                                    src={currentImageUrl}
                                    alt="Preview"
                                    className="max-w-full max-h-full object-contain"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-surface-400 truncate">{currentImageUrl}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onChange('')}
                                className="text-xs text-surface-500 hover:text-surface-300"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
