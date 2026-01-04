import { useState, useEffect, useMemo } from 'react';
import Autocomplete from './Autocomplete';
import IconPreview from './IconPreview';
import IconPicker from './IconPicker';

interface Device {
    id: string;
    model: string;
    columns: number;
    rows: number;
    keyCount: number;
    iconSize: number;
}

type TitleAlign = 'top' | 'middle' | 'bottom';

interface ButtonConfig {
    key: number;
    text?: string;
    icon?: string;
    color?: string;
    iconColor?: string;
    textColor?: string;
    titleAlign?: TitleAlign;
    action?: {
        type: 'ha' | 'navigate' | 'mqtt' | 'command';
        [key: string]: any;
    };
    useEntityState?: boolean;
    stateEntity?: string;
}

interface DeviceConfig {
    brightness?: number;
    pages: {
        [pageName: string]: ButtonConfig[];
    };
}

interface HAEntity {
    entity_id: string;
    name: string;
    domain: string;
    state: string;
}

interface HAService {
    service: string;
    domain: string;
    name: string;
}

interface Props {
    device: Device;
}

// Get base path for API calls (handles Home Assistant ingress)
const getBasePath = () => window.location.pathname.replace(/\/$/, '');

export default function ConfigEditor({ device }: Props) {
    const [config, setConfig] = useState<DeviceConfig>({ pages: { default: [] } });
    const [currentView, setCurrentView] = useState('default');
    const [selectedKey, setSelectedKey] = useState<number | null>(null);
    const [deploying, setDeploying] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [newViewName, setNewViewName] = useState('');
    const [showNewViewInput, setShowNewViewInput] = useState(false);

    // Home Assistant data
    const [entities, setEntities] = useState<HAEntity[]>([]);
    const [services, setServices] = useState<HAService[]>([]);

    // Load config
    useEffect(() => {
        fetch(`${getBasePath()}/api/devices/${device.id}/config`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data) {
                    setConfig(data);
                    // Set current view to first available or default
                    const views = Object.keys(data.pages);
                    if (views.length > 0 && !views.includes(currentView)) {
                        setCurrentView(views[0]);
                    }
                } else {
                    setConfig({ brightness: 80, pages: { default: [] } });
                }
            })
            .catch(() => setConfig({ brightness: 80, pages: { default: [] } }));
    }, [device.id]);

    // Load HA entities and services
    useEffect(() => {
        fetch(`${getBasePath()}/api/ha/entities`)
            .then(res => res.ok ? res.json() : [])
            .then(data => setEntities(data))
            .catch(() => setEntities([]));

        fetch(`${getBasePath()}/api/ha/services`)
            .then(res => res.ok ? res.json() : [])
            .then(data => setServices(data))
            .catch(() => setServices([]));
    }, []);

    const views = useMemo(() => Object.keys(config.pages), [config.pages]);

    const getButtonConfig = (keyIndex: number): ButtonConfig | undefined => {
        return config.pages[currentView]?.find(b => b.key === keyIndex);
    };

    const updateButton = (keyIndex: number, updates: Partial<ButtonConfig>) => {
        setConfig(prev => {
            const pageButtons = [...(prev.pages[currentView] || [])];
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
                    [currentView]: pageButtons
                }
            };
        });
    };

    const createView = () => {
        if (!newViewName.trim() || views.includes(newViewName.trim())) return;

        const viewName = newViewName.trim().toLowerCase().replace(/\s+/g, '_');
        setConfig(prev => ({
            ...prev,
            pages: {
                ...prev.pages,
                [viewName]: []
            }
        }));
        setCurrentView(viewName);
        setNewViewName('');
        setShowNewViewInput(false);
    };

    const deleteView = (viewName: string) => {
        if (viewName === 'default' || views.length <= 1) return;

        setConfig(prev => {
            const newPages = { ...prev.pages };
            delete newPages[viewName];
            return { ...prev, pages: newPages };
        });

        if (currentView === viewName) {
            setCurrentView('default');
        }
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

    const resetConfig = async () => {
        setResetting(true);
        setMessage(null);
        setShowResetConfirm(false);

        try {
            const res = await fetch(`${getBasePath()}/api/devices/${device.id}/config`, {
                method: 'DELETE'
            });

            if (res.ok) {
                const data = await res.json();
                setConfig(data.config);
                setCurrentView('default');
                setSelectedKey(null);
                setMessage({ type: 'success', text: 'Configuration reset to defaults!' });
            } else {
                setMessage({ type: 'error', text: 'Failed to reset config' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: 'Network error' });
        }

        setResetting(false);
    };

    const selectedButton = selectedKey !== null ? getButtonConfig(selectedKey) : null;

    // Convert entities to autocomplete options
    const entityOptions = useMemo(() => {
        return entities.map(e => ({
            value: e.entity_id,
            label: e.name || e.entity_id,
            group: e.domain,
            sublabel: `${e.entity_id} (${e.state})`,
        }));
    }, [entities]);

    // Convert services to autocomplete options
    const serviceOptions = useMemo(() => {
        return services.map(s => ({
            value: s.service,
            label: s.service,
            group: s.domain,
            sublabel: s.name,
        }));
    }, [services]);

    return (
        <div>
            {/* Reset Confirmation Modal */}
            {showResetConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-surface-800 rounded-xl p-6 max-w-md mx-4 border border-surface-700">
                        <h3 className="text-lg font-semibold text-surface-100 mb-3">
                            Reset Configuration?
                        </h3>
                        <p className="text-surface-400 mb-6">
                            This will clear all button configurations and delete all custom views.
                            Only the default view will remain, with no buttons configured.
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="px-4 py-2 rounded-lg font-medium bg-surface-700 hover:bg-surface-600 text-surface-300 transition-colors duration-150"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={resetConfig}
                                className="px-4 py-2 rounded-lg font-medium bg-error-600 hover:bg-error-500 text-white transition-colors duration-150"
                            >
                                Reset Everything
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-semibold text-surface-100">{device.model}</h2>
                    <p className="text-sm text-surface-500 mt-1">
                        {device.columns}x{device.rows} layout • {device.keyCount} buttons
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowResetConfirm(true)}
                        disabled={resetting}
                        className={`
                            px-4 py-2.5 rounded-lg font-medium
                            bg-surface-700 hover:bg-surface-600 text-surface-300
                            disabled:opacity-50 disabled:cursor-not-allowed
                            transition-colors duration-150
                        `}
                    >
                        {resetting ? 'Resetting...' : 'Reset to Defaults'}
                    </button>
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
            </div>

            {/* View Selector */}
            <div className="mb-6 flex items-center gap-3">
                <label className="text-sm font-medium text-surface-400">View:</label>
                <select
                    value={currentView}
                    onChange={e => {
                        setCurrentView(e.target.value);
                        setSelectedKey(null);
                    }}
                    className="px-3 py-2 min-w-[150px]"
                >
                    {views.map(view => (
                        <option key={view} value={view}>
                            {view === 'default' ? 'Default (Home)' : view}
                        </option>
                    ))}
                </select>

                {showNewViewInput ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newViewName}
                            onChange={e => setNewViewName(e.target.value)}
                            placeholder="View name..."
                            className="px-3 py-2 w-32"
                            onKeyDown={e => e.key === 'Enter' && createView()}
                            autoFocus
                        />
                        <button
                            onClick={createView}
                            className="px-3 py-2 bg-success-600 hover:bg-success-700 text-white rounded-lg text-sm"
                        >
                            Add
                        </button>
                        <button
                            onClick={() => { setShowNewViewInput(false); setNewViewName(''); }}
                            className="px-3 py-2 bg-surface-700 hover:bg-surface-600 text-surface-300 rounded-lg text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowNewViewInput(true)}
                        className="px-3 py-2 bg-surface-700 hover:bg-surface-600 text-surface-300 rounded-lg text-sm"
                    >
                        + New View
                    </button>
                )}

                {currentView !== 'default' && (
                    <button
                        onClick={() => deleteView(currentView)}
                        className="px-3 py-2 bg-error-800 hover:bg-error-700 text-error-400 rounded-lg text-sm"
                    >
                        Delete View
                    </button>
                )}
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
                            const bgColor = btn?.color || '#333333';
                            const textColor = btn?.textColor || '#ffffff';
                            const iconColor = btn?.iconColor || '#ffffff';
                            const titleAlign = btn?.titleAlign || 'middle';
                            const hasIcon = !!btn?.icon;
                            const hasText = btn?.text;

                            // Determine justify-content based on titleAlign
                            const justifyClass = titleAlign === 'top'
                                ? 'justify-start'
                                : titleAlign === 'bottom'
                                    ? 'justify-end'
                                    : 'justify-center';

                            return (
                                <button
                                    key={i}
                                    onClick={() => setSelectedKey(i)}
                                    className={`
                                        w-[72px] h-[72px] rounded-lg flex flex-col items-center ${justifyClass}
                                        text-xs text-center transition-all duration-150 relative overflow-hidden p-1
                                        ${selectedKey === i
                                            ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-surface-950'
                                            : 'hover:ring-2 hover:ring-surface-500 hover:ring-offset-1 hover:ring-offset-surface-950'
                                        }
                                    `}
                                    style={{ backgroundColor: bgColor }}
                                >
                                    {hasIcon && (
                                        <div className={hasText ? 'mb-0.5 flex-shrink-0' : 'flex-shrink-0'}>
                                            <IconPreview
                                                icon={btn?.icon}
                                                iconColor={iconColor}
                                                size={hasText ? 32 : 40}
                                            />
                                        </div>
                                    )}
                                    {hasText ? (
                                        <span
                                            style={{ color: textColor }}
                                            className="drop-shadow-md text-[10px] leading-tight max-w-full px-0.5 text-center break-words line-clamp-3"
                                        >
                                            {btn.text}
                                        </span>
                                    ) : !hasIcon ? (
                                        <span style={{ color: textColor }} className="opacity-30">
                                            {i}
                                        </span>
                                    ) : null}
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

                                {/* Title Alignment */}
                                <div>
                                    <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                        Title Alignment
                                    </label>
                                    <div className="flex gap-2">
                                        {(['top', 'middle', 'bottom'] as const).map(align => (
                                            <button
                                                key={align}
                                                onClick={() => updateButton(selectedKey, { titleAlign: align })}
                                                className={`
                                                    flex-1 px-3 py-2 rounded-lg text-sm font-medium capitalize
                                                    transition-colors duration-150
                                                    ${(selectedButton?.titleAlign || 'middle') === align
                                                        ? 'bg-primary-500 text-white'
                                                        : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                                                    }
                                                `}
                                            >
                                                {align}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Icon Picker */}
                                <div>
                                    <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                        Icon
                                    </label>
                                    <IconPicker
                                        value={selectedButton?.icon || ''}
                                        iconColor={selectedButton?.iconColor || '#ffffff'}
                                        onChange={value => updateButton(selectedKey, { icon: value })}
                                    />
                                </div>

                                {/* Color Pickers */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                            Background
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={selectedButton?.color || '#333333'}
                                                onChange={e => updateButton(selectedKey, { color: e.target.value })}
                                                className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                        <span className="text-xs text-surface-600 font-mono">
                                            {selectedButton?.color || '#333333'}
                                        </span>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                            Icon Color
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={selectedButton?.iconColor || '#ffffff'}
                                                onChange={e => updateButton(selectedKey, { iconColor: e.target.value })}
                                                className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                        <span className="text-xs text-surface-600 font-mono">
                                            {selectedButton?.iconColor || '#ffffff'}
                                        </span>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                            Text Color
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={selectedButton?.textColor || '#ffffff'}
                                                onChange={e => updateButton(selectedKey, { textColor: e.target.value })}
                                                className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                        <span className="text-xs text-surface-600 font-mono">
                                            {selectedButton?.textColor || '#ffffff'}
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
                                        <option value="ha">Home Assistant Action</option>
                                        <option value="navigate">Navigate to View</option>
                                        <option value="mqtt">MQTT Publish</option>
                                        <option value="command">Command</option>
                                    </select>
                                </div>

                                {/* Home Assistant Action Fields */}
                                {selectedButton?.action?.type === 'ha' && (
                                    <div className="space-y-4 pt-2 border-t border-surface-700">
                                        {/* Service Selector */}
                                        <div>
                                            <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                                Service
                                            </label>
                                            <Autocomplete
                                                options={serviceOptions}
                                                value={selectedButton.action.service || ''}
                                                onChange={value => updateButton(selectedKey, {
                                                    action: { ...selectedButton.action, type: 'ha', service: value }
                                                })}
                                                placeholder="Search services..."
                                                groupBy={true}
                                            />
                                        </div>

                                        {/* Entity Selector */}
                                        <div>
                                            <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                                Entity
                                            </label>
                                            <Autocomplete
                                                options={entityOptions}
                                                value={selectedButton.action.entityId || ''}
                                                onChange={value => updateButton(selectedKey, {
                                                    action: { ...selectedButton.action, type: 'ha', entityId: value }
                                                })}
                                                placeholder="Search entities..."
                                                groupBy={true}
                                            />
                                        </div>

                                        {/* Entity State Styling */}
                                        <div className="pt-2 border-t border-surface-700">
                                            <div className="flex items-center gap-2 mb-2">
                                                <input
                                                    type="checkbox"
                                                    id="use-entity-state"
                                                    checked={selectedButton.useEntityState || false}
                                                    onChange={e => updateButton(selectedKey, {
                                                        useEntityState: e.target.checked
                                                    })}
                                                    className="w-4 h-4 rounded"
                                                />
                                                <label htmlFor="use-entity-state" className="text-sm font-medium text-surface-300">
                                                    Use entity state to style button
                                                </label>
                                            </div>
                                            {selectedButton.useEntityState && (
                                                <div className="ml-6">
                                                    <p className="text-xs text-surface-500 mb-2">
                                                        Button appearance will update based on entity state.
                                                        For lights: shows on/off state with color and brightness.
                                                    </p>
                                                    <div>
                                                        <label className="block text-xs font-medium text-surface-500 mb-1">
                                                            Track different entity (optional)
                                                        </label>
                                                        <Autocomplete
                                                            options={entityOptions}
                                                            value={selectedButton.stateEntity || ''}
                                                            onChange={value => updateButton(selectedKey, {
                                                                stateEntity: value || undefined
                                                            })}
                                                            placeholder={selectedButton.action.entityId || 'Uses action entity...'}
                                                            groupBy={true}
                                                        />
                                                        <p className="text-xs text-surface-600 mt-1">
                                                            Leave empty to use the action's entity
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Navigate Action Fields */}
                                {selectedButton?.action?.type === 'navigate' && (
                                    <div className="pt-2 border-t border-surface-700">
                                        <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                            Target View
                                        </label>
                                        <select
                                            value={selectedButton.action.page || ''}
                                            onChange={e => updateButton(selectedKey, {
                                                action: { type: 'navigate', page: e.target.value }
                                            })}
                                            className="w-full px-3 py-2.5"
                                        >
                                            <option value="">Select a view...</option>
                                            {views.map(view => (
                                                <option key={view} value={view}>
                                                    {view === 'default' ? 'Default (Home)' : view}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* MQTT Action Fields */}
                                {selectedButton?.action?.type === 'mqtt' && (
                                    <div className="space-y-4 pt-2 border-t border-surface-700">
                                        <div>
                                            <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                                Topic
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="home/bedroom/light"
                                                value={selectedButton.action.topic || ''}
                                                onChange={e => updateButton(selectedKey, {
                                                    action: { ...selectedButton.action, type: 'mqtt', topic: e.target.value }
                                                })}
                                                className="w-full px-3 py-2.5"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                                Payload
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="on"
                                                value={selectedButton.action.payload || ''}
                                                onChange={e => updateButton(selectedKey, {
                                                    action: { ...selectedButton.action, type: 'mqtt', payload: e.target.value }
                                                })}
                                                className="w-full px-3 py-2.5"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="mqtt-retain"
                                                checked={selectedButton.action.retain || false}
                                                onChange={e => updateButton(selectedKey, {
                                                    action: { ...selectedButton.action, type: 'mqtt', retain: e.target.checked }
                                                })}
                                                className="w-4 h-4"
                                            />
                                            <label htmlFor="mqtt-retain" className="text-sm text-surface-400">
                                                Retain message
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* Command Action Fields */}
                                {selectedButton?.action?.type === 'command' && (
                                    <div className="space-y-4 pt-2 border-t border-surface-700">
                                        <div>
                                            <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                                Command
                                            </label>
                                            <select
                                                value={selectedButton.action.command || ''}
                                                onChange={e => updateButton(selectedKey, {
                                                    action: { type: 'command', command: e.target.value }
                                                })}
                                                className="w-full px-3 py-2.5"
                                            >
                                                <option value="">Select a command...</option>
                                                <optgroup label="Display">
                                                    <option value="clear">Clear All Keys</option>
                                                </optgroup>
                                                <optgroup label="Brightness">
                                                    <option value="brightness_up">Brightness Up</option>
                                                    <option value="brightness_down">Brightness Down</option>
                                                    <option value="set_brightness">Set Brightness</option>
                                                </optgroup>
                                                <optgroup label="LCD">
                                                    <option value="lcd_on">LCD On</option>
                                                    <option value="lcd_off">LCD Off</option>
                                                </optgroup>
                                            </select>
                                        </div>

                                        {/* Value field for brightness commands */}
                                        {(selectedButton.action.command === 'brightness_up' ||
                                          selectedButton.action.command === 'brightness_down' ||
                                          selectedButton.action.command === 'set_brightness') && (
                                            <div>
                                                <label className="block text-sm font-medium text-surface-400 mb-1.5">
                                                    {selectedButton.action.command === 'set_brightness'
                                                        ? 'Brightness Level (0-100)'
                                                        : 'Step Amount (default: 10)'}
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    placeholder={selectedButton.action.command === 'set_brightness' ? '50' : '10'}
                                                    value={selectedButton.action.value ?? ''}
                                                    onChange={e => updateButton(selectedKey, {
                                                        action: {
                                                            ...selectedButton.action,
                                                            type: 'command',
                                                            value: e.target.value ? parseInt(e.target.value) : undefined
                                                        }
                                                    })}
                                                    className="w-full px-3 py-2.5"
                                                />
                                                <p className="mt-1.5 text-xs text-surface-600">
                                                    {selectedButton.action.command === 'set_brightness'
                                                        ? 'Set exact brightness percentage'
                                                        : 'Amount to increase/decrease brightness by'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Clear Button Config */}
                                <div className="pt-4 border-t border-surface-700">
                                    <button
                                        onClick={() => {
                                            setConfig(prev => {
                                                const pageButtons = [...(prev.pages[currentView] || [])];
                                                const idx = pageButtons.findIndex(b => b.key === selectedKey);
                                                if (idx >= 0) pageButtons.splice(idx, 1);
                                                return {
                                                    ...prev,
                                                    pages: {
                                                        ...prev.pages,
                                                        [currentView]: pageButtons
                                                    }
                                                };
                                            });
                                        }}
                                        className="w-full px-3 py-2 bg-surface-700 hover:bg-surface-600 text-surface-400 rounded-lg text-sm"
                                    >
                                        Clear Button Configuration
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
