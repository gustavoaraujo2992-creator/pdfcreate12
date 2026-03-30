import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch'; // May need to use dynamic import if it's ESM in an older Node version, but native fetch works in node 18+

const filePath = 'C:\\Users\\leonardo.pedrosa\\Documents\\Agenda INSS 30-03-2026 (2).pdf';

async function testLiveApi() {
    try {
        console.log('[API Test] Starting...');
        const fileStream = fs.createReadStream(filePath);
        
        const formData = new FormData();
        formData.append('pdf', fileStream, 'Agenda INSS 30-03-2026 (2).pdf');
        
        console.log('[API Test] Sending request to http://localhost:3001/api/extract...');
        const response = await fetch('http://localhost:3001/api/extract', {
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            console.error('[API Test] HTTP Error:', response.status, await response.text());
            return;
        }

        const data = await response.json();
        console.log('[API Test] Response received:');
        console.log(JSON.stringify({
            success: data.success,
            pages: data.pages,
            error: data.error,
            parsed_formato: data.parsed?.formato,
            parsed_total: data.parsed?.total,
            // Show only first element of equipe if exists
            parsed_equipe_first: data.parsed?.equipe?.length > 0 ? data.parsed.equipe[0] : null
        }, null, 2));

        if (data.parsed?.total === 0) {
            console.log('[API Test] FAILING! Zero records extracted. Below is the rawText chunk it tried to parse:');
            console.log(data.rawText.substring(0, 1500));
        }

    } catch (err) {
        console.error('[API Test] Error:', err);
    }
}

testLiveApi();
