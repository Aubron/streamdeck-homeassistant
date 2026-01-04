import React, { useState, useEffect } from 'react';

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

export default function ConfigEditor({ device }: Props) {
    const [config, setConfig] = useState<DeviceConfig>({ pages: { default: [] } });
    const [currentPage, setCurrentPage] = useState('default');
    const [selectedKey, setSelectedKey] = useState<number | null>(null);
    const [deploying, setDeploying] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetch(`/api/devices/${device.id}/config`)
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
            const res = await fetch(`/api/devices/${device.id}/config`, {
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2>{device.model}</h2>
                <button
                    onClick={deploy}
                    disabled={deploying}
                    style={{
                        padding: '10px 20px',
                        background: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: deploying ? 'wait' : 'pointer',
                        opacity: deploying ? 0.7 : 1
                    }}
                >
                    {deploying ? 'Deploying...' : 'Deploy'}
                </button>
            </div>

            {message && (
                <div style={{
                    padding: 12,
                    marginBottom: 20,
                    borderRadius: 6,
                    background: message.type === 'success' ? '#1b5e20' : '#b71c1c'
                }}>
                    {message.text}
                </div>
            )}

            <div style={{ display: 'flex', gap: 40 }}>
                {/* Grid */}
                <div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${device.columns}, 80px)`,
                            gap: 8,
                            background: '#111',
                            padding: 16,
                            borderRadius: 12
                        }}
                    >
                        {Array.from({ length: device.keyCount }, (_, i) => {
                            const btn = getButtonConfig(i);
                            return (
                                <div
                                    key={i}
                                    onClick={() => setSelectedKey(i)}
                                    style={{
                                        width: 80,
                                        height: 80,
                                        background: btn?.color || '#333',
                                        borderRadius: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        border: selectedKey === i ? '3px solid #4a9eff' : '3px solid transparent',
                                        fontSize: 12,
                                        textAlign: 'center',
                                        padding: 4,
                                        wordBreak: 'break-word'
                                    }}
                                >
                                    {btn?.text || btn?.icon || i}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Editor Panel */}
                {selectedKey !== null && (
                    <div style={{ flex: 1, maxWidth: 400 }}>
                        <h3 style={{ marginBottom: 16 }}>Button {selectedKey}</h3>

                        <label style={{ display: 'block', marginBottom: 12 }}>
                            <span style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#888' }}>Text</span>
                            <input
                                type="text"
                                value={selectedButton?.text || ''}
                                onChange={e => updateButton(selectedKey, { text: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: 10,
                                    background: '#2a2a4e',
                                    border: '1px solid #444',
                                    borderRadius: 6,
                                    color: '#fff'
                                }}
                            />
                        </label>

                        <label style={{ display: 'block', marginBottom: 12 }}>
                            <span style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#888' }}>Icon (ph:name, http://..., or #color)</span>
                            <input
                                type="text"
                                value={selectedButton?.icon || ''}
                                onChange={e => updateButton(selectedKey, { icon: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: 10,
                                    background: '#2a2a4e',
                                    border: '1px solid #444',
                                    borderRadius: 6,
                                    color: '#fff'
                                }}
                            />
                        </label>

                        <label style={{ display: 'block', marginBottom: 12 }}>
                            <span style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#888' }}>Background Color</span>
                            <input
                                type="color"
                                value={selectedButton?.color || '#333333'}
                                onChange={e => updateButton(selectedKey, { color: e.target.value })}
                                style={{ width: 60, height: 40 }}
                            />
                        </label>

                        <label style={{ display: 'block', marginBottom: 12 }}>
                            <span style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#888' }}>Action Type</span>
                            <select
                                value={selectedButton?.action?.type || ''}
                                onChange={e => updateButton(selectedKey, {
                                    action: e.target.value ? { type: e.target.value as any } : undefined
                                })}
                                style={{
                                    width: '100%',
                                    padding: 10,
                                    background: '#2a2a4e',
                                    border: '1px solid #444',
                                    borderRadius: 6,
                                    color: '#fff'
                                }}
                            >
                                <option value="">None</option>
                                <option value="ha">Home Assistant</option>
                                <option value="navigate">Navigate</option>
                                <option value="mqtt">MQTT</option>
                                <option value="command">Command</option>
                            </select>
                        </label>

                        {selectedButton?.action?.type === 'ha' && (
                            <>
                                <label style={{ display: 'block', marginBottom: 12 }}>
                                    <span style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#888' }}>Service</span>
                                    <input
                                        type="text"
                                        placeholder="light.toggle"
                                        value={selectedButton.action.service || ''}
                                        onChange={e => updateButton(selectedKey, {
                                            action: { ...selectedButton.action, service: e.target.value }
                                        })}
                                        style={{
                                            width: '100%',
                                            padding: 10,
                                            background: '#2a2a4e',
                                            border: '1px solid #444',
                                            borderRadius: 6,
                                            color: '#fff'
                                        }}
                                    />
                                </label>
                                <label style={{ display: 'block', marginBottom: 12 }}>
                                    <span style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#888' }}>Entity ID</span>
                                    <input
                                        type="text"
                                        placeholder="light.living_room"
                                        value={selectedButton.action.entityId || ''}
                                        onChange={e => updateButton(selectedKey, {
                                            action: { ...selectedButton.action, entityId: e.target.value }
                                        })}
                                        style={{
                                            width: '100%',
                                            padding: 10,
                                            background: '#2a2a4e',
                                            border: '1px solid #444',
                                            borderRadius: 6,
                                            color: '#fff'
                                        }}
                                    />
                                </label>
                            </>
                        )}

                        {selectedButton?.action?.type === 'navigate' && (
                            <label style={{ display: 'block', marginBottom: 12 }}>
                                <span style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#888' }}>Page</span>
                                <input
                                    type="text"
                                    placeholder="default"
                                    value={selectedButton.action.page || ''}
                                    onChange={e => updateButton(selectedKey, {
                                        action: { ...selectedButton.action, page: e.target.value }
                                    })}
                                    style={{
                                        width: '100%',
                                        padding: 10,
                                        background: '#2a2a4e',
                                        border: '1px solid #444',
                                        borderRadius: 6,
                                        color: '#fff'
                                    }}
                                />
                            </label>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
