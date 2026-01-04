import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { EntityState, ButtonConfig, DeviceConfig } from './types';

export interface StateManagerEvents {
    stateChanged: (entityId: string, state: EntityState) => void;
    connected: () => void;
    disconnected: () => void;
    error: (error: Error) => void;
}

export class StateManager extends EventEmitter {
    private ws: WebSocket | null = null;
    private baseUrl: string;
    private token: string;
    private entityStates: Map<string, EntityState> = new Map();
    private subscribedEntities: Set<string> = new Set();
    private messageId: number = 1;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isConnected: boolean = false;
    private pendingSubscription: boolean = false;

    constructor() {
        super();
        // Convert HTTP URL to WebSocket URL
        const httpUrl = process.env.HOMEASSISTANT_URL || 'http://homeassistant.local:8123';
        this.baseUrl = httpUrl.replace(/^http/, 'ws') + '/api/websocket';
        this.token = process.env.HOMEASSISTANT_TOKEN || '';
    }

    async connect(): Promise<void> {
        if (this.ws && this.isConnected) {
            return;
        }

        if (!this.token) {
            console.warn('StateManager: No HOMEASSISTANT_TOKEN, state tracking disabled');
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                console.log(`StateManager: Connecting to ${this.baseUrl}`);
                this.ws = new WebSocket(this.baseUrl);

                this.ws.on('open', () => {
                    console.log('StateManager: WebSocket connected');
                });

                this.ws.on('message', async (data: Buffer) => {
                    try {
                        const message = JSON.parse(data.toString());
                        await this.handleMessage(message, resolve);
                    } catch (e) {
                        console.error('StateManager: Error parsing message', e);
                    }
                });

                this.ws.on('close', () => {
                    console.log('StateManager: WebSocket closed');
                    this.isConnected = false;
                    this.emit('disconnected');
                    this.scheduleReconnect();
                });

                this.ws.on('error', (error) => {
                    console.error('StateManager: WebSocket error', error);
                    this.emit('error', error);
                    reject(error);
                });

            } catch (e) {
                console.error('StateManager: Failed to create WebSocket', e);
                reject(e);
            }
        });
    }

    private async handleMessage(message: any, connectResolve?: (value: void) => void) {
        switch (message.type) {
            case 'auth_required':
                // Send authentication
                this.send({
                    type: 'auth',
                    access_token: this.token
                });
                break;

            case 'auth_ok':
                console.log('StateManager: Authenticated successfully');
                this.isConnected = true;
                this.emit('connected');
                if (connectResolve) connectResolve();
                // Subscribe to state changes if we have entities
                if (this.subscribedEntities.size > 0) {
                    await this.subscribeToStateChanges();
                }
                break;

            case 'auth_invalid':
                console.error('StateManager: Authentication failed', message.message);
                this.emit('error', new Error('Authentication failed'));
                break;

            case 'event':
                if (message.event?.event_type === 'state_changed') {
                    const eventData = message.event.data;
                    const entityId = eventData.entity_id;
                    const newState = eventData.new_state;

                    if (newState && this.subscribedEntities.has(entityId)) {
                        const state: EntityState = {
                            entity_id: newState.entity_id,
                            state: newState.state,
                            attributes: newState.attributes || {},
                            last_changed: newState.last_changed,
                            last_updated: newState.last_updated
                        };
                        this.entityStates.set(entityId, state);
                        this.emit('stateChanged', entityId, state);
                    }
                }
                break;

            case 'result':
                if (message.success && message.result && Array.isArray(message.result)) {
                    // This is the response to get_states
                    for (const entity of message.result) {
                        if (this.subscribedEntities.has(entity.entity_id)) {
                            const state: EntityState = {
                                entity_id: entity.entity_id,
                                state: entity.state,
                                attributes: entity.attributes || {},
                                last_changed: entity.last_changed,
                                last_updated: entity.last_updated
                            };
                            this.entityStates.set(entity.entity_id, state);
                            this.emit('stateChanged', entity.entity_id, state);
                        }
                    }
                }
                break;
        }
    }

    private send(message: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    private async subscribeToStateChanges() {
        if (!this.isConnected || this.pendingSubscription) return;

        this.pendingSubscription = true;

        // Subscribe to state_changed events
        const subscribeId = this.messageId++;
        this.send({
            id: subscribeId,
            type: 'subscribe_events',
            event_type: 'state_changed'
        });

        // Get current states for all subscribed entities
        const getStatesId = this.messageId++;
        this.send({
            id: getStatesId,
            type: 'get_states'
        });

        this.pendingSubscription = false;
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            console.log('StateManager: Attempting reconnect...');
            try {
                await this.connect();
            } catch (e) {
                console.error('StateManager: Reconnect failed', e);
                this.scheduleReconnect();
            }
        }, 5000);
    }

    /**
     * Update the list of entities to track based on the current config
     */
    updateTrackedEntities(config: DeviceConfig) {
        const entitiesToTrack = new Set<string>();

        // Find all buttons with useEntityState enabled
        for (const pageName in config.pages) {
            const page = config.pages[pageName];
            for (const button of page) {
                if (button.useEntityState) {
                    // Use stateEntity if specified, otherwise fall back to action.entityId
                    const entityId = button.stateEntity ||
                        (button.action?.type === 'ha' ? button.action.entityId : undefined);

                    if (entityId) {
                        entitiesToTrack.add(entityId);
                    }
                }
            }
        }

        // Update subscribed entities
        const hadEntities = this.subscribedEntities.size > 0;
        this.subscribedEntities = entitiesToTrack;

        console.log(`StateManager: Tracking ${entitiesToTrack.size} entities:`,
            Array.from(entitiesToTrack).join(', '));

        // If we now have entities and are connected, subscribe
        if (!hadEntities && entitiesToTrack.size > 0 && this.isConnected) {
            this.subscribeToStateChanges();
        }
    }

    /**
     * Get the current state of an entity
     */
    getState(entityId: string): EntityState | undefined {
        return this.entityStates.get(entityId);
    }

    /**
     * Check if we have state for an entity
     */
    hasState(entityId: string): boolean {
        return this.entityStates.has(entityId);
    }

    /**
     * Disconnect from the WebSocket
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }
}

/**
 * Compute styling for a light entity based on its state
 */
export function computeLightStyle(state: EntityState | undefined, baseConfig: ButtonConfig): {
    color: string;
    iconColor: string;
    textColor: string;
    icon: string;
} {
    const defaultOffStyle = {
        color: '#1a1a1a',
        iconColor: '#666666',
        textColor: '#888888',
        icon: baseConfig.icon || 'ph:lightbulb'
    };

    if (!state || state.state === 'off' || state.state === 'unavailable' || state.state === 'unknown') {
        return defaultOffStyle;
    }

    // Light is ON - compute colors based on attributes
    const attrs = state.attributes;

    // Determine the light color
    let lightColor: [number, number, number] | null = null;

    if (attrs.rgb_color) {
        lightColor = attrs.rgb_color;
    } else if (attrs.hs_color) {
        // Convert HS to RGB (simplified)
        lightColor = hsToRgb(attrs.hs_color[0], attrs.hs_color[1] / 100);
    } else if (attrs.color_temp) {
        // Warm white for color temp lights
        lightColor = colorTempToRgb(attrs.color_temp);
    }

    // Calculate brightness factor (0-1)
    const brightness = attrs.brightness !== undefined
        ? Math.max(0.3, attrs.brightness / 255) // Min 0.3 so it's still visible
        : 1;

    if (lightColor) {
        // Use the light color for background, tinted by brightness
        const bgColor = `#${toHex(lightColor[0] * brightness)}${toHex(lightColor[1] * brightness)}${toHex(lightColor[2] * brightness)}`;

        // Icon and text should be contrasting - use white or dark based on luminance
        const luminance = (0.299 * lightColor[0] + 0.587 * lightColor[1] + 0.114 * lightColor[2]) / 255 * brightness;
        const contrastColor = luminance > 0.5 ? '#000000' : '#ffffff';

        return {
            color: bgColor,
            iconColor: contrastColor,
            textColor: contrastColor,
            icon: baseConfig.icon || 'ph:lightbulb-filament'
        };
    }

    // No color info - just show as bright
    const brightLevel = Math.floor(brightness * 255);
    return {
        color: `#${toHex(brightLevel)}${toHex(brightLevel * 0.9)}${toHex(brightLevel * 0.7)}`, // Warm white
        iconColor: '#000000',
        textColor: '#000000',
        icon: baseConfig.icon || 'ph:lightbulb-filament'
    };
}

// Helper: Convert value to 2-digit hex
function toHex(value: number): string {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    return clamped.toString(16).padStart(2, '0');
}

// Helper: Convert HS to RGB
function hsToRgb(h: number, s: number): [number, number, number] {
    const c = s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = 1 - c;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

// Helper: Convert color temperature to RGB (simplified)
function colorTempToRgb(mired: number): [number, number, number] {
    // Mired to Kelvin
    const kelvin = 1000000 / mired;

    // Simplified color temperature to RGB
    if (kelvin <= 4000) {
        // Warm (orange-ish)
        return [255, 180, 100];
    } else if (kelvin <= 5500) {
        // Neutral white
        return [255, 240, 220];
    } else {
        // Cool (bluish)
        return [200, 220, 255];
    }
}
