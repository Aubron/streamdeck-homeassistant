import React from 'react';

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
            <div style={{ color: '#666', fontSize: 14 }}>
                <p>No devices discovered yet.</p>
                <p style={{ marginTop: 10 }}>
                    Make sure your Stream Deck runner is connected to the same MQTT broker.
                </p>
            </div>
        );
    }

    return (
        <ul style={{ listStyle: 'none' }}>
            {devices.map(device => (
                <li
                    key={device.id}
                    onClick={() => onSelect(device)}
                    style={{
                        padding: '12px 16px',
                        marginBottom: 8,
                        background: selectedId === device.id ? '#2a2a4e' : '#1e1e38',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: selectedId === device.id ? '2px solid #4a4a8e' : '2px solid transparent'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{device.model}</strong>
                        <span
                            style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: device.status === 'online' ? '#4caf50' : '#f44336'
                            }}
                        />
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        {device.columns}x{device.rows} ({device.keyCount} keys) - {device.iconSize}px
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                        {device.id.substring(0, 16)}...
                    </div>
                </li>
            ))}
        </ul>
    );
}
