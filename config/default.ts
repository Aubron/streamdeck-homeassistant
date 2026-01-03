import { DeviceConfig } from '../src/types';

const config: DeviceConfig = {
    brightness: 80,
    pages: {
        default: [
            {
                key: 0,
                text: 'Living Room',
                icon: 'ph:lightbulb',
                action: {
                    type: 'ha',
                    service: 'light.toggle',
                    entityId: 'light.bar_spotlight'
                }
            },
            {
                key: 1,
                text: 'System',
                icon: 'ph:gear',
                action: {
                    type: 'navigate',
                    page: 'system'
                }
            }
        ],
        system: [
            {
                key: 0,
                text: 'Back',
                icon: 'ph:arrow-left',
                action: {
                    type: 'navigate',
                    page: 'default'
                }
            },
            {
                key: 14,
                text: 'Reboot',
                icon: 'ph:power',
                action: {
                    type: 'command',
                    command: 'reboot'
                }
            }
        ]
    }
};

export default config;
