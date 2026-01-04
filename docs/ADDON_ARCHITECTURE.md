# Stream Deck Manager Architecture

## Overview

This document outlines the architecture for splitting the Stream Deck application into two components:

1. **Runner** - Runs on Raspberry Pi (Balena), controls the physical Stream Deck device
2. **Manager** - Home Assistant Add-on providing a web UI for configuration

## Critical Requirements

### Discovery Must Include Device Size

Stream Decks come in multiple sizes with different icon dimensions:

| Device | Icon Size | Layout (cols × rows) | Total Keys |
|--------|-----------|---------------------|------------|
| Stream Deck Mini | 80×80 px | 3×2 | 6 |
| Stream Deck Original | 72×72 px | 5×3 | 15 |
| Stream Deck MK.2 | 72×72 px | 5×3 | 15 |
| Stream Deck XL | 96×96 px | 8×4 | 32 |
| Stream Deck + | 72×72 px | 4×2 | 8 + LCD |
| Stream Deck Pedal | N/A | 1×3 | 3 |

The Manager **must** know `iconSize` to generate correctly-sized button images.

---

## Phase 1: Runner Modifications

### 1.1 Enhanced Discovery Message

**Topic:** `streamdeck/{DEVICE_ID}/discovery`

**Payload:**
```json
{
  "model": "Stream Deck XL",
  "serial": "ABC123456789",
  "firmware": "1.02.003",
  "version": "1.0.0",
  "columns": 8,
  "rows": 4,
  "keyCount": 32,
  "iconSize": 96,
  "capabilities": {
    "brightness": true,
    "lcd": false
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Key additions over current `/info` topic:**
- `iconSize` - **Critical** for manager to generate proper images
- `version` - Runner software version from package.json
- `capabilities` - Future-proofing for Stream Deck + LCD, pedal, etc.
- `timestamp` - When discovery was published

### 1.2 Config Subscription

**Subscribe to:** `streamdeck/{DEVICE_ID}/config/set`

**Payload Schema:**
```json
{
  "brightness": 80,
  "pages": {
    "default": [
      {
        "key": 0,
        "text": "Living Room",
        "icon": "ph:lightbulb",
        "color": "#1a1a2e",
        "action": {
          "type": "ha",
          "service": "light.toggle",
          "entityId": "light.living_room"
        }
      }
    ]
  }
}
```

### 1.3 Config Caching Strategy

The Runner becomes a "dumb" receiver with no local config logic. Only JSON caching for startup reliability.

```
config/
└── cached.json    # Last-known-good from MQTT
```

**Startup Behavior:**
1. Load cached JSON if exists (`config/cached.json`)
2. If no cache: display "waiting for config" state (clear all keys, show status)
3. Subscribe to MQTT for config updates
4. On receiving MQTT config: save to cache, apply, restart NavigationManager

**Files to Remove:**
- `config/default.ts` - No longer needed
- `src/ConfigManager.ts` - Replace with simpler JSON-only loader

**New ConfigManager API:**
```typescript
class ConfigManager {
  static getCachedConfig(): DeviceConfig | null;  // Load from cached.json
  static saveConfig(config: DeviceConfig): void;  // Save to cached.json
}
```

### 1.4 Config Acknowledgment

**Publish to:** `streamdeck/{DEVICE_ID}/config/status`

**Payload:**
```json
{
  "status": "applied",
  "configHash": "abc123",
  "timestamp": "2024-01-15T10:31:00Z",
  "error": null
}
```

Or on error:
```json
{
  "status": "error",
  "configHash": "abc123",
  "timestamp": "2024-01-15T10:31:00Z",
  "error": "Invalid page reference: 'nonexistent'"
}
```

---

## Phase 2: Manager Add-on

### 2.1 Repository Structure for Distribution

Home Assistant add-ons can be distributed via custom repositories. The recommended structure:

```
streamdeck-homeassistant/           # Main repository (existing)
├── src/                            # Runner source (existing)
├── config/                         # Runner configs (existing)
├── Dockerfile.template             # Runner Balena build (existing)
├── addon/                          # NEW: HA Add-on directory
│   ├── config.yaml                 # Add-on configuration
│   ├── Dockerfile                  # Add-on build
│   ├── run.sh                      # Entry script
│   ├── icon.png                    # 128x128 add-on icon
│   ├── logo.png                    # 250x100 logo
│   ├── DOCS.md                     # HA documentation
│   ├── CHANGELOG.md                # Version history
│   ├── package.json                # Manager dependencies
│   └── src/
│       ├── server.ts               # Express/Fastify server
│       ├── mqtt.ts                 # MQTT subscription handler
│       ├── database.ts             # Device & config storage
│       └── web/                    # React frontend
│           ├── App.tsx
│           ├── DeviceList.tsx
│           └── ConfigEditor.tsx
└── repository.yaml                 # NEW: Repository metadata
```

### 2.2 Add-on config.yaml

```yaml
name: "Stream Deck Manager"
description: "Configure Stream Deck devices via MQTT"
version: "1.0.0"
slug: "streamdeck_manager"
url: "https://github.com/Aubron/streamdeck-homeassistant"
arch:
  - amd64
  - aarch64
  - armv7
init: false
homeassistant_api: true
hassio_api: true
ingress: true
ingress_port: 8099
panel_icon: "mdi:view-grid"
panel_title: "Stream Deck"
options:
  mqtt_host: ""
  mqtt_port: 1883
  mqtt_user: ""
  mqtt_password: ""
schema:
  mqtt_host: str?
  mqtt_port: int
  mqtt_user: str?
  mqtt_password: str?
```

**Key Features:**
- `ingress: true` - No custom auth needed, uses HA authentication
- `homeassistant_api: true` - Can fetch entities for autocomplete
- `hassio_api: true` - Can discover Mosquitto add-on settings

### 2.3 repository.yaml (for custom repo installation)

```yaml
name: Stream Deck Home Assistant
url: https://github.com/Aubron/streamdeck-homeassistant
maintainer: Aubron
```

**Installation:** Users add `https://github.com/Aubron/streamdeck-homeassistant` as a custom repository in HA Add-on Store.

### 2.4 Manager Features

1. **Device Discovery**
   - Subscribe to `streamdeck/+/discovery`
   - Maintain list of known devices with last-seen timestamp
   - Show device status (online/offline based on MQTT LWT)

2. **Visual Config Editor**
   - Grid editor matching device dimensions (from discovery `columns` × `rows`)
   - Icon picker (Phosphor icons, URL, color)
   - Action builder (HA service, navigate, MQTT, command)
   - Live preview using actual `iconSize` from discovery

3. **Entity Autocomplete**
   - Use HA API to fetch available entities
   - Filter by domain (light, switch, scene, script, etc.)

4. **Deploy Configuration**
   - Publish to `streamdeck/{DEVICE_ID}/config/set`
   - Wait for acknowledgment on `streamdeck/{DEVICE_ID}/config/status`
   - Show success/error feedback

5. **Persistence**
   - Store configs in `/data/streamdeck_manager.json` (HA persistent storage)
   - Track config versions/history

---

## Phase 3: MQTT Topic Structure

Complete topic hierarchy:

```
streamdeck/
└── {DEVICE_ID}/
    ├── discovery          # Device info (retained, published by Runner)
    ├── status             # "online" | "offline" (LWT)
    ├── config/
    │   ├── set            # Manager → Runner (config payload)
    │   └── status         # Runner → Manager (ack/error)
    ├── key/
    │   └── {N}/
    │       ├── state      # "pressed" | "released" (Runner → MQTT)
    │       ├── set_image  # Override image (MQTT → Runner)
    │       └── set_text   # Override text (MQTT → Runner)
    ├── set_brightness     # Set brightness (MQTT → Runner)
    └── command            # Commands like "clear" (MQTT → Runner)
```

---

## Implementation Priorities

### High Priority
1. Add `iconSize` to discovery message (Runner)
2. Add `version` to discovery message (Runner)
3. Remove TypeScript config system (delete `config/default.ts`, simplify `ConfigManager.ts`)
4. Implement MQTT config subscription in Runner (`config/set` topic)
5. Create `/addon` directory structure with `config.yaml`

### Medium Priority
6. Config caching with JSON persistence (`config/cached.json`)
7. "Waiting for config" state when no cache exists
8. Manager web server with device discovery
9. Visual grid editor based on device dimensions (uses `iconSize`)

### Lower Priority
10. Entity autocomplete from HA API
11. Config version history
12. Multi-device management from single Manager

---

## Testing Strategy

### Runner Changes
1. Use MQTT Explorer to manually publish config to `streamdeck/{id}/config/set`
2. Verify Stream Deck updates immediately
3. Restart Runner, verify cached config loads from `config/cached.json`
4. Remove cache, verify "waiting for config" state (all keys cleared)

### Manager Simulation
1. Run manager locally with `npm run dev`
2. Verify discovery messages appear in device list
3. Create config in UI, click Deploy
4. Verify MQTT message sent with correct topic/payload
5. Verify Runner applies config

### Integration
1. Deploy Runner to Balena device
2. Install Manager add-on in HA
3. Verify end-to-end flow: discover → configure → deploy → apply

---

## Differences from Gemini's Original Proposal

| Gemini Proposal | This Plan | Reason |
|-----------------|-----------|--------|
| Strip local config | **Agreed** - Remove TypeScript configs | Runner is dumb receiver |
| `streamdeck/{id}/config` topic | `streamdeck/{id}/config/set` | Clearer hierarchy, room for `/status` ack |
| Model/Serial/Version only | Add `iconSize`, `capabilities` | **Critical** for proper image generation |
| `manager/` directory | `addon/` directory | Matches HA add-on conventions |
| New Node.js project | Subdirectory in monorepo | Simpler distribution via single repo |

---

## Open Questions

1. **Should Manager render icons or just send config?**
   - Option A: Manager sends config JSON, Runner renders icons locally
   - Option B: Manager pre-renders icons to exact `iconSize`, sends as base64
   - Recommendation: Option A (current approach) - Runner has rendering pipeline

2. **Multiple Runners, single Manager?**
   - Yes, Manager should handle multiple devices
   - Each Runner publishes its own discovery
   - Manager tracks all discovered devices

3. **Config schema versioning?**
   - Add `configVersion: 1` field for future migrations
   - Manager can upgrade old configs automatically
