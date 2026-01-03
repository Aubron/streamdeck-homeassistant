# Stream Deck Home Assistant Controller

A robust, "Configuration-as-Code" controller for Elgato Stream Deck devices running on Raspberry Pi (via Balena) or any Linux/macOS machine. It integrates with Home Assistant via MQTT.

## Features

-   **Instant Startup**: Buttons render immediately on boot using local configuration (no waiting for Home Assistant automations).
-   **Hybrid Control**:
    -   **Local Actions**: Folder navigation, page switching, brightness control.
    -   **MQTT Actions**: Triggers Home Assistant entities directly.
    -   **Legacy Support**: Still publishes `key/#/state` events for HA-side automations to consume.
-   **Phosphor Icons**: Built-in support for thousands of icons via `ph:icon-name`.
-   **TypeScript**: Fully typed codebase for reliability.

## Configuration

Configuration is handled via **TypeScript** files in the `config/` directory.

1.  **Default Config**: `config/default.ts` is loaded if no device-specific config is found.
2.  **Device Config**: Create `config/[DEVICE_UUID].ts` to target a specific device (uses `BALENA_DEVICE_UUID` or hostname).

### Example Configuration

```typescript
import { DeviceConfig } from '../src/types';

const config: DeviceConfig = {
    brightness: 80,
    pages: {
        // The 'default' page is loaded on startup
        default: [
            {
                key: 0,
                text: 'Living Room',
                icon: 'ph:lightbulb', // Uses Phosphor Icons (white by default)
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
                    page: 'system_page' // Navigates to pages.system_page
                }
            },
            {
                key: 2,
                color: '#FF0000', // Simple color fill
                action: {
                    type: 'network_request', // Custom actions can be added
                    // ...
                }
            }
        ],
        system_page: [
            {
                key: 0,
                text: 'Back',
                icon: 'ph:arrow-left',
                action: { type: 'navigate', page: 'default' }
            },
            {
                key: 4,
                text: 'Reboot',
                icon: 'ph:power',
                action: { type: 'command', command: 'reboot' } // Local command support
            }
        ]
    }
};

export default config;
```

### Icon Support

-   **Phosphor Icons**: `ph:acorn`, `ph:lightbulb-fill` (see [Phosphor Icons](https://phosphoricons.com/))
-   **Local Files**: `local:my-icon.png` (relative to `assets/` directory)
-   **Colors**: `#FF0000` (Hex color codes)

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MQTT_URL` | Broker URL | `mqtt://homeassistant.local` |
| `MQTT_USER` | Broker Username | - |
| `MQTT_PASS` | Broker Password | - |
| `BALENA_DEVICE_UUID` | Device ID for config lookup | `streamdeck-unknown` |
| `HOMEASSISTANT_URL` | HA Instance URL | `http://homeassistant.local:8123` |
| `HOMEASSISTANT_TOKEN` | Long-Lived Access Token | - |

## Development

```bash
# Install dependencies
npm install

# Run locally (uses tsx)
npm start

# Build for production
npm run build
```

## Deployment (Balena)

This project is set up for BalenaCloud. Push this repository to your Balena application.

```bash
balena push <app-name>
```
