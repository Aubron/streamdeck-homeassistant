
export class HomeAssistantClient {
    private baseUrl: string;
    private token: string;

    constructor() {
        this.baseUrl = process.env.HOMEASSISTANT_URL || 'http://homeassistant.local:8123';
        this.token = process.env.HOMEASSISTANT_TOKEN || '';

        // Tidy up URL
        if (this.baseUrl.endsWith('/')) {
            this.baseUrl = this.baseUrl.slice(0, -1);
        }
        if (!this.baseUrl.startsWith('http://') && !this.baseUrl.startsWith('https://')) {
            this.baseUrl = `http://${this.baseUrl}`;
        }
    }

    async callService(service: string, entityId?: string, data: Record<string, any> = {}) {
        if (!this.token) {
            console.error('HOMEASSISTANT_TOKEN not set, cannot call API');
            return;
        }

        const [domain, serviceName] = service.split('.');
        if (!domain || !serviceName) {
            console.error(`Invalid service format: ${service}. Expected domain.service`);
            return;
        }

        let url: URL;
        try {
            url = new URL(`${this.baseUrl}/api/services/${domain}/${serviceName}`);
        } catch (e) {
            console.error(`Invalid Home Assistant URL: ${this.baseUrl}/api/services/${domain}/${serviceName}`);
            return;
        }

        const payload = { ...data };
        if (entityId) {
            payload.entity_id = entityId;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`Home Assistant API Error (${response.status}): ${text}`);
            } else {
                // Success
                // We could log something but generic success is noisy
            }
        } catch (e) {
            console.error('Failed to call Home Assistant API:', e);
        }
    }
}
