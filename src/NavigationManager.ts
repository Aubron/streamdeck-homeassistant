import { PageRenderer } from './PageRenderer';
import { DeviceConfig, Action } from './types';

export class NavigationManager {
    private renderer: PageRenderer;
    private config: DeviceConfig;
    private currentPageName: string = 'default';

    constructor(renderer: PageRenderer, config: DeviceConfig) {
        this.renderer = renderer;
        this.config = config;
    }

    public get currentPage() {
        return this.currentPageName;
    }

    async start() {
        await this.navigateTo('default');
    }

    async navigateTo(pageName: string) {
        if (this.config.pages[pageName]) {
            this.currentPageName = pageName;
            console.log(`Navigating to page: ${pageName}`);
            await this.renderer.renderPage(this.config.pages[pageName]);
        } else {
            console.error(`Page not found: ${pageName}`);
        }
    }

    // Returns the action to be executed generally (like MQTT), or null if handled natively (navigation)
    async handleButtonPress(keyIndex: number): Promise<Action | null> {
        const page = this.config.pages[this.currentPageName];
        if (!page) return null;

        const button = page[keyIndex];
        if (!button || !button.action) return null;

        const action = button.action;

        if (action.type === 'navigate') {
            await this.navigateTo(action.page);
            return null; // Handled
        }

        return action;
    }
}
