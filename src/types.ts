
export interface MqttAction {
    type: 'mqtt';
    topic: string;
    payload: string;
    retain?: boolean;
}

export interface NavigateAction {
    type: 'navigate';
    page: string;
}

export interface CommandAction {
    type: 'command';
    command: string; // e.g. 'clear'
}

export type Action = MqttAction | NavigateAction | CommandAction;

export interface ButtonConfig {
    key: number;
    text?: string;
    icon?: string; // 'ph:name', 'local:path', 'http:url', or '#RRGGBB'
    color?: string; // Background color
    action?: Action;
}

export interface PageConfig {
    [key: number]: ButtonConfig;
}

export interface DeviceConfig {
    brightness?: number;
    pages: {
        [pageName: string]: ButtonConfig[];
    };
}
