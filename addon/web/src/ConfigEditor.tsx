import { useState, useEffect } from 'react';

interface Device {
    id: string;
    model: string;
    columns: number;
    rows: number;
    keyCount: number;
    iconSize: number;
}

interface ButtonConfig {
    key: number;
    text?: string;
    icon?: string;
    color?: string;
    action?: {
        type: 'ha' | 'navigate' | 'mqtt' | 'command';
        [key: string]: any;
    };
}

interface DeviceConfig {
    brightness?: number;
    pages: {
        [pageName: string]: ButtonConfig[];
    };
}

interface Props {
    device: Device;
}

// Get base path for API calls (handles Home Assistant ingress)
const getBasePath = () => window.location.pathname.replace(/\/$/, '');

export default function ConfigEditor({ device }: Props) {
    const [config, setConfig] = useState<DeviceConfig>({ pages: { default: [] } });
    const [currentPage] = useState('default');
    const [selectedKey, setSelectedKey] = useState<number | null>(null);
    const [deploying, setDeploying] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetch(`${getBasePath()}/api/devices/${device.id}/config`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data) setConfig(data);
                else setConfig({ brightness: 80, pages: { default: [] } });
            })
            .catch(() => setConfig({ brightness: 80, pages: { default: [] } }));
    }, [device.id]);

    const getButtonConfig = (keyIndex: number): ButtonConfig | undefined => {
        return config.pages[currentPage]?.find(b => b.key === keyIndex);
    };

    const updateButton = (keyIndex: number, updates: Partial<ButtonConfig>) => {
        setConfig(prev => {
            const pageButtons = [...(prev.pages[currentPage] || [])];
            const existingIndex = pageButtons.findIndex(b => b.key === keyIndex);

            if (existingIndex >= 0) {
                pageButtons[existingIndex] = { ...pageButtons[existingIndex], ...updates };
            } else {
                pageButtons.push({ key: keyIndex, ...updates });
            }

            return {
                ...prev,
                pages: {
                    ...prev.pages,
                    [currentPage]: pageButtons
                }
            };
        });
    };

    const deploy = async () => {
        setDeploying(true);
        setMessage(null);

        try {
            const res = await fetch(`${getBasePath()}/api/devices/${device.id}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Config deployed successfully!' });
            } else {
                setMessage({ type: 'error', text: 'Failed to deploy config' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: 'Network error' });
        }

        setDeploying(false);
    };

    const selectedButton = selectedKey !== null ? getButtonConfig(selectedKey) : null;

    return (
        <div>
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-semibold text-surface-100">{device.model}</h2>
                    <p className="text-sm text-surface-500 mt-1">
                        {device.columns}x{device.rows} layout • {device.keyCount} buttons
                    </p>
                </div>
                <button
                    onClick={deploy}
                    disabled={deploying}
                    className={`
                        px-5 py-2.5 rounded-lg font-medium text-white
                        bg-primary-500 hover:bg-primary-600
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors duration-150
                    `}
                >
                    {deploying ? 'Deploying...' : 'Deploy Configuration'}
                </button>
            </div>

            {/* Status Message */}
            {message && (
                <div className={`
                    p-4 mb-6 rounded-lg flex items-center gap-3
                    ${message.type === 'success' ? 'bg-success-800 text-success-500' : 'bg-error-800 text-error-500'}
                `}>
                    {message.type === 'success' ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                    )}
                    <span className="font-medium">{message.text}</span>
                </div>
            )}

            <div className="flex gap-8">
                {/* Button Grid */}
                <div>
                    <div
                        className="bg-surface-950 p-4 rounded-xl border border-surface-800"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${device.columns}, 72px)`,
                            gap: '6px',
                        }}
                    >
                        {Array.from({ length: device.keyCount }, (_, i) => {
                            const btn = getButtonConfig(i);
                            return (
                                <button
                                    key={i}
                                    onClick={() => setSelectedKey(i)}
                                    className={`
                                        w-[72px] h-[72px] rounded-lg flex items-center justify-center
                                        text-xs text-center p-1 break-words transition-all duration-150
                                        ${selectedKey === i
                                            ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-surface-950'
                                            : 'hover:ring-2 hover:ring-surface-500 hover:ring-offset-1 hover:ring-offset-surface-950'
                                        }
                                    `}
                                    style={{ backgroundColor: btn?.color || '#333333' }}
                                >
                                    <span className="text-white drop-shadow-md">
                                        {btn?.text || btn?.icon || i}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Editor Panel */}
                {selectedKey !== null && (
                    <div className="flex-1 max-w-md">
                        <div className="bg-card rounded-xl p-5 border border-surface-800">
                            <h3 className="text-lg font-medium text-surface-100 mb-5">
                                Button {selectedKey} Configuration
                            </h3>

                            <div className="space-y-5">
                                {/* Text Input */}
                                <div>
                                    <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                        Display Text
                                    </label>
                                    <input
                                        type="text"
                                        value={selectedButton?.text || ''}
                                        onChange={e => updateButton(selectedKey, { text: e.target.value })}
                                        placeholder="Button label..."
                                        className="w-full px-3 py-2.5"
                                    />
                                </div>

                                {/* Icon Input */}
                                <div>
                                    <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                        Icon
                                    </label>
                                    <input
                                        type="text"
                                        value={selectedButton?.icon || ''}
                                        onChange={e => updateButton(selectedKey, { icon: e.target.value })}
                                        placeholder="ph:house, http://..., or #color"
                                        className="w-full px-3 py-2.5"
                                    />
                                    <p className="mt-1.5 text-xs text-surface-600">
                                        Phosphor icon name, URL, or hex color
                                    </p>
                                </div>

                                {/* Color Picker */}
                                <div>
                                    <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                        Background Color
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="color"
                                            value={selectedButton?.color || '#333333'}
                                            onChange={e => updateButton(selectedKey, { color: e.target.value })}
                                            className="w-12 h-10 rounded cursor-pointer border-0 p-0"
                                        />
                                        <span className="text-sm text-surface-500 font-mono">
                                            {selectedButton?.color || '#333333'}
                                        </span>
                                    </div>
                                </div>

                                {/* Action Type */}
                                <div>
                                    <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                        Action Type
                                    </label>
                                    <select
                                        value={selectedButton?.action?.type || ''}
                                        onChange={e => updateButton(selectedKey, {
                                            action: e.target.value ? { type: e.target.value as any } : undefined
                                        })}
                                        className="w-full px-3 py-2.5"
                                    >
                                        <option value="">None</option>
                                        <option value="ha">Home Assistant Service</option>
                                        <option value="navigate">Navigate to Page</option>
                                        <option value="mqtt">MQTT Publish</option>
                                        <option value="command">Shell Command</option>
                                    </select>
                                </div>

                                {/* Home Assistant Action Fields */}
                                {selectedButton?.action?.type === 'ha' && (
                                    <div className="space-y-4 pt-2 border-t border-surface-700">
                                        <div>
                                            <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                                Service
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="light.toggle"
                                                value={selectedButton.action.service || ''}
                                                onChange={e => updateButton(selectedKey, {
                                                    action: { type: 'ha', ...selectedButton.action, service: e.target.value }
                                                })}
                                                className="w-full px-3 py-2.5"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                                Entity ID
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="light.living_room"
                                                value={selectedButton.action.entityId || ''}
                                                onChange={e => updateButton(selectedKey, {
                                                    action: { type: 'ha', ...selectedButton.action, entityId: e.target.value }
                                                })}
                                                className="w-full px-3 py-2.5"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Navigate Action Fields */}
                                {selectedButton?.action?.type === 'navigate' && (
                                    <div className="pt-2 border-t border-surface-700">
                                        <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                            Target Page
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="default"
                                            value={selectedButton.action.page || ''}
                                            onChange={e => updateButton(selectedKey, {
                                                action: { type: 'navigate', ...selectedButton.action, page: e.target.value }
                                            })}
                                            className="w-full px-3 py-2.5"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
