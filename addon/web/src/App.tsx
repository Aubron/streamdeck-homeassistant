import React, { useState, useEffect } from 'react';
import DeviceList from './DeviceList';
import ConfigEditor from './ConfigEditor';

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

export default function App() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [ws, setWs] = useState<WebSocket | null>(null);

    useEffect(() => {
        // Fetch initial devices
        fetch('/api/devices')
            .then(res => res.json())
            .then(setDevices)
            .catch(console.error);

        // Setup WebSocket for real-time updates
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}`);

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'devices') {
                setDevices(message.data);
            } else if (message.type === 'deviceDiscovered') {
                setDevices(prev => {
                    const existing = prev.findIndex(d => d.id === message.data.id);
                    if (existing >= 0) {
                        const updated = [...prev];
                        updated[existing] = message.data;
                        return updated;
                    }
                    return [...prev, message.data];
                });
            } else if (message.type === 'deviceStatus') {
                setDevices(prev => prev.map(d =>
                    d.id === message.data.deviceId
                        ? { ...d, status: message.data.status }
                        : d
                ));
            }
        };

        setWs(socket);
        return () => socket.close();
    }, []);

    return (
        <div style={{ display: 'flex', height: '100vh' }}>
            <aside style={{ width: 300, background: '#16162a', padding: 20, overflowY: 'auto' }}>
                <h1 style={{ fontSize: 20, marginBottom: 20 }}>Stream Deck Manager</h1>
                <DeviceList
                    devices={devices}
                    selectedId={selectedDevice?.id}
                    onSelect={setSelectedDevice}
                />
            </aside>
            <main style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                {selectedDevice ? (
                    <ConfigEditor device={selectedDevice} />
                ) : (
                    <div style={{ textAlign: 'center', marginTop: 100, color: '#666' }}>
                        <p>Select a device to configure</p>
                    </div>
                )}
            </main>
        </div>
    );
}
