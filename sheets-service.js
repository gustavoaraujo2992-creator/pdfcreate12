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
            mode: 'no-cors', // Apps Script requires no-cors sometimes for simple POSTs or handles CORS in doGet/doPost
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // Since no-cors doesn't allow reading the response, 
        // we'll assume success if no exception is thrown, 
        // or the user should use a proper CORS setup in Apps Script.
        return { success: true };
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
