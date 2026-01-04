interface Device {
    id: string;
    model: string;
    serial: string;
    columns: number;
    rows: number;
    keyCount: number;
    iconSize: number;
    status: 'online' | 'offline' | 'unknown';
    lastSeen: string;
}

interface Props {
    devices: Device[];
    selectedId?: string;
    onSelect: (device: Device) => void;
}

export default function DeviceList({ devices, selectedId, onSelect }: Props) {
    if (devices.length === 0) {
        return (
            <div className="text-surface-500 text-sm">
                <p>No devices discovered yet.</p>
                <p className="mt-3 text-surface-600">
                    Make sure your Stream Deck runner is connected to the same MQTT broker.
                </p>
            </div>
        );
    }

    return (
        <ul className="space-y-2">
            {devices.map(device => (
                <li
                    key={device.id}
                    onClick={() => onSelect(device)}
                    className={`
                        p-3 rounded-lg cursor-pointer transition-all duration-150
                        ${selectedId === device.id
                            ? 'bg-card-selected ring-2 ring-primary-500'
                            : 'bg-card hover:bg-card-hover'
                        }
                    `}
                >
                    <div className="flex justify-between items-center">
                        <span className="font-medium text-surface-100">{device.model}</span>
                        <span
                            className={`
                                w-2.5 h-2.5 rounded-full
                                ${device.status === 'online' ? 'bg-success-500' : 'bg-error-500'}
                            `}
                        />
                    </div>
                    <div className="text-xs text-surface-400 mt-1">
                        {device.columns}x{device.rows} ({device.keyCount} keys) • {device.iconSize}px
                    </div>
                    <div className="text-xs text-surface-600 mt-1 font-mono">
                        {device.id.substring(0, 16)}...
                    </div>
                </li>
            ))}
        </ul>
    );
}
