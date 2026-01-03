import { PageRenderer } from './PageRenderer';
import { HomeAssistantClient } from './HomeAssistantClient';
import { DeviceConfig, Action, MqttAction, CommandAction, HomeAssistantAction } from './types';
import { MqttClient } from 'mqtt';
import { ConfigManager } from './ConfigManager';

export class NavigationManager {
    private renderer: PageRenderer;
    private config: DeviceConfig;
    private currentPage: string = 'default';
    private haClient: HomeAssistantClient;
    private myStreamDeck: any;
    private mqttClient: MqttClient;
    private configManager: ConfigManager;

    constructor(myStreamDeck: any, client: MqttClient, configManager: ConfigManager, renderer: PageRenderer, config: DeviceConfig) {
        this.myStreamDeck = myStreamDeck;
        this.mqttClient = client;
        this.configManager = configManager;
        this.renderer = renderer;
        this.config = config;
        this.haClient = new HomeAssistantClient();
    }

    async start() {
        // Start background prewarming
        this.renderer.prewarm(this.config.pages).catch(e => console.error('Prewarming failed:', e));

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
            console.log(`Executing HA Action: ${action.service}`);
            await this.haClient.callService(action.service, action.entityId, action.data);
            return null; // Handled
        } else if (action.type === 'command') {
            // Let index.ts handle command for now or handle here?
            // specific 'clear' command logic was in index.ts
            // We can duplicate or expose clear functionality
            if (action.command === 'clear') {
                // Clear all keys
                try {
                    for (let i = 0; i < this.myStreamDeck.NUM_KEYS; i++) {
                        await this.myStreamDeck.clearKey(i);
                    }
                } catch (e) {
                    console.error('Error clearing keys:', e);
                }
            }
            return action; // return for logging or other processing
        }

        return action; // MQTT actions returned to index.ts
    }
}
