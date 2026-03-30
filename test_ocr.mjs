import fs from 'fs';
import { pdf } from 'pdf-to-img';
import { parseINSSText } from './parser.mjs';
import config from './config.mjs';

const filePath = 'C:\\Users\\leonardo.pedrosa\\Documents\\Agenda INSS 30-03-2026 (2).pdf';
const pdfBuffer = fs.readFileSync(filePath);

async function testOCR() {
    console.log('[Test OCR] Running local OCR simulation...');
    let fullText = '';
    let pageNum = 0;
    try {
        const pages = await pdf(pdfBuffer, { scale: 1.1 });
        
        for await (const pageImage of pages) {
            pageNum++;
            console.log(`[Test OCR] Processing page ${pageNum}...`);
            const fd = new FormData();
            fd.append('apikey', config.ocr.apiKey);
            fd.append('language', config.ocr.language);
            fd.append('isTable', 'true');
            fd.append('scale', 'true');
            fd.append('base64Image', `data:image/png;base64,${pageImage.toString('base64')}`);

            const response = await fetch('https://api.ocr.space/parse/image', {
                method: 'POST',
                body: fd
            });

            if (!response.ok) {
                console.error(`[Test OCR] HTTP Error ${response.status}`);
                continue;
            }

            const result = await response.json();
            if (result.IsErroredOnProcessing) {
                console.error(`[Test OCR] Error on page ${pageNum}:`, result.ErrorMessage);
                continue;
            }

            const text = result.ParsedResults?.[0]?.ParsedText || '';
            fullText += `--- PÁGINA ${pageNum} ---\n${text}\n\n`;
            
            // Only test 2 pages for speed
            if (pageNum >= 2) break;
        }

        console.log('\n--- TEXTO EXTRAÍDO (PRIMEIROS 1000 CARACTERES) ---');
        console.log(fullText.substring(0, 1000));
        console.log('\n--- RESULTADO DO PARSER ---');
        
        const parsed = parseINSSText(fullText);
        console.log(JSON.stringify(parsed, null, 2));
        
    } catch (e) {
        console.error('[Test OCR] Exception:', e);
    }
}

testOCR();
