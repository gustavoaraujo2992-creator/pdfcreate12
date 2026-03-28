/**
 * SheetsService - Handles communication with Google Apps Script Web App
 */
export class SheetsService {
    constructor() {
        // Provided by the user:
        const defaultUrl = 'https://script.google.com/macros/s/AKfycbw1CzitBmMIU2TUB07oE25_kvtalMFvolgt7zKQJr3QpqsZ7Dh82zViki5hANu1IIRrCw/exec';
        this.scriptUrl = localStorage.getItem('google_script_url') || defaultUrl;
        
        // Ensure it's saved in localStorage if not already
        if (!localStorage.getItem('google_script_url')) {
            localStorage.setItem('google_script_url', defaultUrl);
        }
    }

    setScriptUrl(url) {
        this.scriptUrl = url;
        localStorage.setItem('google_script_url', url);
    }

    async saveExtraction(metadata, records) {
        if (!this.scriptUrl) {
            throw new Error('Configuração do Google Sheets ausente. Por favor, configure a URL do Script.');
        }

        const payload = {
            action: 'save',
            metadata: {
                name: metadata.name,
                reason: metadata.reason,
                sector: metadata.sector,
                date: metadata.date,
                timestamp: new Date().toISOString()
            },
            data: records
        };

        const response = await fetch(this.scriptUrl, {
            method: 'POST',
            mode: 'no-cors', // Apps Script requires no-cors for simple bypass of preflights
            headers: {
                // Must be text/plain for no-cors to avoid preflight
                'Content-Type': 'text/plain' 
            },
            body: JSON.stringify(payload)
        });

        // In no-cors mode, the response is 'opaque' (status 0).
        // We can't see the result, but if it successfully sent, we assume OK.
        // Network errors will still be caught by the outer try-catch in main.js
        return { success: true, opaque: true };
    }

    async fetchLatest() {
        if (!this.scriptUrl) return null;

        try {
            const response = await fetch(`${this.scriptUrl}?action=getLatest`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching from sheets:', error);
            return null;
        }
    }
}
