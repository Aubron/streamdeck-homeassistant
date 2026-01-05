# Stream Deck Home Assistant Controller

A robust Stream Deck controller for Elgato Stream Deck devices that integrates with Home Assistant. Run it on a Raspberry Pi (via Balena) or any Linux/macOS machine.

## Features

- **Instant Startup**: Buttons render immediately on boot using cached configuration
- **Web-Based Configuration**: Visual button editor with live preview via Home Assistant add-on
- **Dynamic Entity State Styling**: Buttons automatically change appearance based on Home Assistant entity states (lights show actual color and brightness)
- **Rich Icon Support**: 3,500+ Phosphor icons, remote images, local files, or solid colors
- **Multi-Page Navigation**: Organize buttons across multiple pages
- **Full Home Assistant Integration**: Call any HA service with custom data payloads
- **MQTT Control**: Direct MQTT publishing and legacy automation support
- **Multi-Device Support**: Manage multiple Stream Decks from a single interface

## Architecture

The system has two components:

1. **Stream Deck Controller** (runs on device with Stream Deck)
   - Handles real-time button rendering and press detection
   - Connects to Home Assistant via REST API and WebSocket
   - Communicates via MQTT for configuration and status

2. **Home Assistant Add-on** (runs in Home Assistant)
   - Web UI for visual button configuration
   - Device discovery and management
   - Configuration deployment via MQTT

## Installation

### Option 1: Home Assistant Add-on (Recommended)

1. Add this repository to Home Assistant Add-on Store
2. Install the "Stream Deck Controller" add-on
3. Configure MQTT settings in add-on options
4. Access the web UI through the Home Assistant sidebar

### Option 2: Balena Deployment

```bash
balena push <app-name>
```

### Option 3: Standalone

```bash
npm install
npm start
```

## Configuration

### Environment Variables

#### Required

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MQTT_URL` | MQTT broker URL (e.g., `mqtt://192.168.1.100:1883`) | `mqtt://homeassistant.local` |
| `HOMEASSISTANT_TOKEN` | Long-Lived Access Token for Home Assistant | - |

#### Optional

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MQTT_USER` | MQTT broker username | - |
| `MQTT_PASS` | MQTT broker password | - |
| `HOMEASSISTANT_URL` | Home Assistant instance URL | `http://homeassistant.local:8123` |
| `BALENA_DEVICE_UUID` | Device ID for config lookup | hostname |

### Device Configuration

Configuration can be managed via the web UI or TypeScript files in `config/`.

```typescript
import { DeviceConfig } from '../src/types';

const config: DeviceConfig = {
    brightness: 80,
    pages: {
        default: [
            {
                key: 0,
                text: 'Living Room',
                icon: 'ph:lightbulb',
                color: '#333333',
                iconColor: '#ffffff',
                textColor: '#ffffff',
                titleAlign: 'middle',        // 'top', 'middle', or 'bottom'
                useEntityState: true,        // Enable dynamic state styling
                stateEntity: 'light.living', // Entity to track (uses action entityId if not set)
                action: {
                    type: 'ha',
                    service: 'light.toggle',
                    entityId: 'light.living_room',
                    data: {                  // Optional service data
                        brightness: 255,
                        transition: 2
                    }
                }
            },
            {
                key: 1,
                text: 'System',
                icon: 'ph:gear',
                action: {
                    type: 'navigate',
                    page: 'system_page'
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
                text: 'Bright+',
                icon: 'ph:sun',
                action: { type: 'command', command: 'brightness_up' }
            }
        ]
    }
};

export default config;
```

### Button Properties

| Property | Type | Description |
| :--- | :--- | :--- |
| `key` | number | Button position (0-14 for Stream Deck XL) |
| `text` | string | Button label (supports word wrapping) |
| `icon` | string | Icon source (see Icon Support below) |
| `color` | string | Background color (hex) |
| `iconColor` | string | Icon tint color (hex, Phosphor icons only) |
| `textColor` | string | Text color (hex) |
| `titleAlign` | string | Text vertical alignment: `top`, `middle`, `bottom` |
| `useEntityState` | boolean | Enable dynamic styling from entity state |
| `stateEntity` | string | Entity ID for state tracking |
| `action` | object | Button press action |

### Icon Support

| Format | Example | Description |
| :--- | :--- | :--- |
| Phosphor Icons | `ph:lightbulb`, `ph:house-fill` | 3,500+ icons from [Phosphor Icons](https://phosphoricons.com/) |
| Remote Images | `https://example.com/icon.png` | Direct HTTP/HTTPS URLs |
| Local Files | `local:my-icon.png` | Files in `assets/` directory |
| Solid Colors | `#FF0000` | Hex color codes |

### Action Types

#### Home Assistant Service Call

```typescript
{
    type: 'ha',
    service: 'light.turn_on',
    entityId: 'light.living_room',
    data: {                    // Optional service data
        brightness: 255,
        rgb_color: [255, 0, 0]
    }
}
```

#### Navigate to Page

```typescript
{
    type: 'navigate',
    page: 'page_name'
}
```

#### MQTT Publish

```typescript
{
    type: 'mqtt',
    topic: 'home/light/set',
    payload: 'ON',
    retain: false              // Optional
}
```

#### Local Commands

```typescript
{
    type: 'command',
    command: 'brightness_up'   // or 'brightness_down', 'set_brightness', 'lcd_on', 'lcd_off', 'clear'
    value: 80                  // Optional, for set_brightness
}
```

### Entity State Styling

When `useEntityState: true`, buttons automatically update their appearance based on Home Assistant entity states:

- **Lights**: Background color matches the light's actual color and brightness
- **Switches/Binary Sensors**: Green tint when on, dark when off
- **Text Color**: Automatically adjusts for contrast

## Web UI

The Home Assistant add-on provides a web interface for configuration:

- **Device List**: See all connected Stream Decks with real-time status
- **Visual Editor**: Point-and-click button configuration
- **Live Preview**: See how buttons will look before deploying
- **Entity Autocomplete**: Search and select Home Assistant entities
- **Icon Picker**: Browse and select from Phosphor icons
- **One-Click Deploy**: Push configuration to devices instantly

## MQTT Topics

The controller publishes and subscribes to these MQTT topics:

| Topic | Direction | Description |
| :--- | :--- | :--- |
| `streamdeck/{deviceId}/status` | Publish | Device online/offline status |
| `streamdeck/{deviceId}/key/{n}/state` | Publish | Button press events |
| `streamdeck/{deviceId}/config/set` | Subscribe | Receive configuration updates |
| `streamdeck/{deviceId}/config/hash` | Publish | Current config hash for sync |

## Development

```bash
# Install dependencies
npm install

# Run controller locally
npm start

# Build for production
npm run build

# Run add-on web UI development server
cd addon/web && npm run dev
```

## Troubleshooting

### MQTT Connection Refused

```
MQTT error: AggregateError [ECONNREFUSED]
```

- Verify MQTT broker is running
- Check `MQTT_URL` points to correct IP/port
- Ensure firewall allows connection
- Home Assistant Mosquitto add-on default port is `1883`

### Stream Deck Not Detected

- Check USB connection
- Verify udev rules are installed (Linux)
- Run `lsusb` to confirm device is visible

### Buttons Not Updating

- Check Home Assistant WebSocket connection in logs
- Verify `HOMEASSISTANT_TOKEN` is valid
- Ensure `useEntityState: true` is set on button

## License

MIT
