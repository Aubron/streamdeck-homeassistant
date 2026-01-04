import { PageRenderer } from './PageRenderer';
import { HomeAssistantClient } from './HomeAssistantClient';
import { DeviceConfig, Action, MqttAction, CommandAction, HomeAssistantAction, EntityState } from './types';
import { MqttClient } from 'mqtt';
import { ConfigManager } from './ConfigManager';
import { StateManager } from './StateManager';

export class NavigationManager {
    private renderer: PageRenderer;
    private config: DeviceConfig;
    private currentPage: string = 'default';
    private haClient: HomeAssistantClient;
    private myStreamDeck: any;
    private mqttClient: MqttClient;
    private configManager: ConfigManager;
    private stateManager: StateManager;
    private currentBrightness: number = 50; // Track current brightness for increment/decrement commands
    private savedBrightness: number = 50; // Saved brightness for LCD on/off toggle

    constructor(myStreamDeck: any, client: MqttClient, configManager: ConfigManager, renderer: PageRenderer, config: DeviceConfig, stateManager: StateManager) {
        this.myStreamDeck = myStreamDeck;
        this.mqttClient = client;
        this.configManager = configManager;
        this.renderer = renderer;
        this.config = config;
        this.haClient = new HomeAssistantClient();
        this.stateManager = stateManager;

        // Set up state change listener
        this.stateManager.on('stateChanged', this.handleStateChange.bind(this));

        // Update tracked entities from config
        this.stateManager.updateTrackedEntities(config);
    }

    /**
     * Handle entity state changes from Home Assistant
     */
    private async handleStateChange(entityId: string, state: EntityState) {
        console.log(`State changed: ${entityId} -> ${state.state}`);

        // Find buttons on the current page that use this entity
        const page = this.config.pages[this.currentPage];
        if (!page) return;

        for (const button of page) {
            if (!button.useEntityState) continue;

            const trackedEntity = button.stateEntity ||
                (button.action?.type === 'ha' ? button.action.entityId : undefined);

            if (trackedEntity === entityId) {
                // Re-render this button
                console.log(`Re-rendering button ${button.key} for entity ${entityId}`);
                await this.renderer.renderKey(button.key, button);
            }
        }
    }

    async start() {
        await this.navigateTo('default');
    }

    /**
     * Update config and restart rendering
     */
    async updateConfig(newConfig: DeviceConfig) {
        console.log('Updating config...');
        this.config = newConfig;

        // Update tracked entities for state-based styling
        this.stateManager.updateTrackedEntities(newConfig);

        // Apply brightness if specified
        if (newConfig.brightness !== undefined) {
            this.currentBrightness = newConfig.brightness;
            this.savedBrightness = newConfig.brightness;
            await this.myStreamDeck.setBrightness(newConfig.brightness);
        }

        // Navigate to default page - hash-based cache handles re-rendering efficiently
        await this.navigateTo('default');
    }

    async navigateTo(pageName: string) {
        if (this.config.pages[pageName]) {
            this.currentPage = pageName;
            console.log(`Navigating to page: ${pageName}`);
            await this.renderer.renderPage(this.config.pages[pageName], pageName);
        } else {
            console.error(`Page not found: ${pageName}`);
        }
    }

    // Handles button press and returns Action if it needs to be processed by index.ts (or handles it internally)
    // Actually, index.ts expects Action or null.
    // If we handle it here (e.g. navigation or HA), we might return null or a specific type.
    async handleButtonPress(keyIndex: number): Promise<Action | null> {
        const page = this.config.pages[this.currentPage];
        if (!page) return null;

        const button = page.find(b => b.key === keyIndex); // Array search or index access? config is array.
        // Wait, PageConfig is ButtonConfig[].
        // But in default.ts it's an array.
        // But key property is explicit.
        if (!button) return null;

        const action = button.action;
        if (!action) return null;

        if (action.type === 'navigate') {
            await this.navigateTo(action.page);
            return null; // Handled
        } else if (action.type === 'ha') {
            if (!action.service) {
                console.error('HA Action has no service configured');
                return null;
            }
            console.log(`Executing HA Action: ${action.service}`);
            await this.haClient.callService(action.service, action.entityId, action.data);
            return null; // Handled
        } else if (action.type === 'command') {
            try {
                switch (action.command) {
                    case 'clear':
                        // Clear all keys
                        for (let i = 0; i < this.myStreamDeck.NUM_KEYS; i++) {
                            await this.myStreamDeck.clearKey(i);
                        }
                        break;

                    case 'brightness_up':
                        // Increase brightness by 10 (or custom step via value)
                        const upStep = action.value ?? 10;
                        this.currentBrightness = Math.min(100, this.currentBrightness + upStep);
                        this.savedBrightness = this.currentBrightness;
                        await this.myStreamDeck.setBrightness(this.currentBrightness);
                        console.log(`Brightness increased to ${this.currentBrightness}%`);
                        break;

                    case 'brightness_down':
                        // Decrease brightness by 10 (or custom step via value)
                        const downStep = action.value ?? 10;
                        this.currentBrightness = Math.max(0, this.currentBrightness - downStep);
                        this.savedBrightness = this.currentBrightness;
                        await this.myStreamDeck.setBrightness(this.currentBrightness);
                        console.log(`Brightness decreased to ${this.currentBrightness}%`);
                        break;

                    case 'set_brightness':
                        // Set brightness to specific value
                        if (action.value !== undefined) {
                            this.currentBrightness = Math.max(0, Math.min(100, action.value));
                            this.savedBrightness = this.currentBrightness;
                            await this.myStreamDeck.setBrightness(this.currentBrightness);
                            console.log(`Brightness set to ${this.currentBrightness}%`);
                        }
                        break;

                    case 'lcd_off':
                        // Turn off LCD by setting brightness to 0
                        this.currentBrightness = 0;
                        await this.myStreamDeck.setBrightness(0);
                        console.log('LCD turned off');
                        break;

                    case 'lcd_on':
                        // Turn on LCD by restoring saved brightness (or default to 100)
                        this.currentBrightness = this.savedBrightness > 0 ? this.savedBrightness : 100;
                        await this.myStreamDeck.setBrightness(this.currentBrightness);
                        console.log(`LCD turned on (brightness: ${this.currentBrightness}%)`);
                        break;

                    default:
                        console.log(`Unknown command: ${action.command}`);
                }
            } catch (e) {
                console.error(`Error executing command '${action.command}':`, e);
            }
            return action; // return for logging or other processing
        }

        return action; // MQTT actions returned to index.ts
    }
}
