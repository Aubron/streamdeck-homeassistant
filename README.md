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
                    type: 'mqtt',
                    topic: 'home/kitchen/light/set',
                    payload: 'ON'
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
-   **Remote URLs**: `https://example.com/image.png` (Direct HTTP/HTTPS links)
-   **Colors**: `#FF0000` (Hex color codes)

## Environment Variables

### Required for Operation

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :---: |
| `MQTT_URL` | Full MQTT broker URL (e.g., `mqtt://192.168.1.100:1883`) | `mqtt://homeassistant.local` | **Yes** |
| `HOMEASSISTANT_TOKEN` | Long-Lived Access Token for Home Assistant API | - | **Yes** (for HA actions) |

### Optional Configuration

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MQTT_USER` | MQTT broker username (if authentication required) | - |
| `MQTT_PASS` | MQTT broker password (if authentication required) | - |
| `HOMEASSISTANT_URL` | Home Assistant instance URL | `http://homeassistant.local:8123` |
| `BALENA_DEVICE_UUID` | Device ID for config lookup (falls back to hostname) | `streamdeck-unknown` |

### Quick Start

1. **Set up MQTT connection** (required):
   ```bash
   export MQTT_URL="mqtt://your-mqtt-broker-ip:1883"
   # If your broker requires authentication:
   export MQTT_USER="your-username"
   export MQTT_PASS="your-password"
   ```

2. **Set up Home Assistant connection** (required for HA actions):
   ```bash
   export HOMEASSISTANT_URL="http://your-home-assistant-ip:8123"
   export HOMEASSISTANT_TOKEN="your-long-lived-access-token"
   ```

   To create a Long-Lived Access Token in Home Assistant:
   - Go to your Profile (click your username in the sidebar)
   - Scroll to "Long-Lived Access Tokens"
   - Click "Create Token" and copy the value

### Troubleshooting

**MQTT Connection Refused Error:**
```
MQTT error: AggregateError [ECONNREFUSED]
```
This means the MQTT broker is not reachable at the configured URL. Verify:
- Your MQTT broker (e.g., Mosquitto) is running
- The `MQTT_URL` points to the correct IP/hostname and port
- The broker is accessible from this machine (check firewall rules)
- If using Home Assistant's Mosquitto add-on, the default port is `1883`

**Example `.env` file:**
```bash
MQTT_URL=mqtt://192.168.1.100:1883
MQTT_USER=mqtt_user
MQTT_PASS=mqtt_password
HOMEASSISTANT_URL=http://192.168.1.100:8123
HOMEASSISTANT_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

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
