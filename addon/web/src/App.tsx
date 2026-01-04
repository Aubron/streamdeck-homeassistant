import { useState, useEffect } from 'react';
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
    const [, setWs] = useState<WebSocket | null>(null);

    useEffect(() => {
        // Get base path for API calls (handles Home Assistant ingress)
        const basePath = window.location.pathname.replace(/\/$/, '');

        // Fetch initial devices
        fetch(`${basePath}/api/devices`)
            .then(res => res.json())
            .then(setDevices)
            .catch(console.error);

        // Setup WebSocket for real-time updates
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}${basePath}`);

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
        <div className="flex h-screen">
            <aside className="w-72 bg-surface-900 border-r border-surface-700 p-5 overflow-y-auto">
                <h1 className="text-xl font-semibold mb-6 text-surface-100">
                    Stream Deck Manager
                </h1>
                <DeviceList
                    devices={devices}
                    selectedId={selectedDevice?.id}
                    onSelect={setSelectedDevice}
                />
            </aside>
            <main className="flex-1 p-6 overflow-y-auto bg-surface-950">
                {selectedDevice ? (
                    <ConfigEditor device={selectedDevice} />
                ) : (
                    <div className="flex items-center justify-center h-full text-surface-500">
                        <div className="text-center">
                            <svg className="w-16 h-16 mx-auto mb-4 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                            </svg>
                            <p className="text-lg">Select a device to configure</p>
                            <p className="text-sm text-surface-600 mt-2">Choose a Stream Deck from the sidebar</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
