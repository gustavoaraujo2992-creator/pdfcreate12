import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());

// ─── PDF Extract Endpoint ─────────────────────────────────────
app.post('/api/extract', upload.single('pdf'), async (req, res) => {
    console.log('[Server] PDF recebido:', req.file?.originalname, req.file?.size, 'bytes');

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        // Convert PDF pages to images using pdf-to-img
        console.log('[Server] Convertendo PDF em imagens...');
        const pdfBuffer = req.file.buffer;
        const pages = await pdf(pdfBuffer, { scale: 2.0 });

        // OCR each page image with Tesseract.js
        console.log('[Server] Iniciando OCR com Tesseract.js...');
        const worker = await createWorker('por');

        let fullText = '';
        let pageNum = 0;

        for await (const pageImage of pages) {
            pageNum++;
            console.log(`[OCR] Processando página ${pageNum}...`);
            const { data: { text } } = await worker.recognize(pageImage);
            fullText += `--- PÁGINA ${pageNum} ---\n${text}\n\n`;
            console.log(`[OCR] Página ${pageNum}: ${text.length} chars extraídos`);
        }

        await worker.terminate();
        console.log(`[Server] OCR completo. Total: ${fullText.length} chars`);

        // Parse the OCR text
        const parsed = parseINSSText(fullText);
        console.log(`[Server] Resultado: ${parsed.equipe.length} registros encontrados`);

        res.json({
            success: true,
            pages: pageNum,
            rawText: fullText,
            parsed
        });

    } catch (error) {
        console.error('[Server] Erro:', error);
        res.status(500).json({ error: 'Falha na extração: ' + error.message });
    }
});

// ─── INSS Text Parser ─────────────────────────────────────────
function parseINSSText(rawText) {
    const lines = rawText.split('\n');
    const equipe = [];
    let setor = '';
    let dataRef = '';

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('---')) continue;

        // Expanded Sector matching: catch Unidade, Órgão Local, Setor, Agência
        const sectorMatch = trimmed.match(/(?:Unidade|[ÓO]rg[ãa]o\s*Local|Setor|Local|Ag[êe]ncia)[:\-\s]*((?!\d{2}\/\d{2})(?:[A-ZÀ-Üa-zà-ü0-9\-\.\/\s]+))/i);
        if (sectorMatch) {
            let possibleSector = sectorMatch[1].trim();
            // Remove common trailing junk like dates or other headers if accidentally captured
            possibleSector = possibleSector.split(/\s\d{2}\/\d{2}\/\d{4}/)[0].split(/\sCPF:/i)[0].trim();
            if (possibleSector.length > 3 && !/^(DATA|NOME|CPF|HORA|P[AÁ]GINA|ID)/i.test(possibleSector)) {
                setor = possibleSector.toUpperCase();
            }
        }

        // Date
        const dm = trimmed.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (dm && !dataRef) dataRef = dm[1];

        // Ensure we have a default fallback
        const activeSector = setor || 'INSS (NÃO IDENTIFICADO)';

        // Strategy 1: "Data de Nascimento" anchor
        if (/data\s*(de\s*)?nascimento/i.test(trimmed)) {
            const namePart = trimmed.split(/data\s*(de\s*)?nascimento/i)[0]
                .replace(/[-–—:]/g, ' ').replace(/[^A-ZÀ-Üa-zà-ü\s]/g, '').trim().toUpperCase();

            if (namePart.length > 4) {
                const cpfM = trimmed.match(/(\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})/) || trimmed.match(/(\d{11})/);
                let cpf = cpfM ? formatCPF(cpfM[1].replace(/\D/g, '')) : 'NÃO INFORMADO';
                const tm = trimmed.match(/(\d{2}:\d{2})/);
                equipe.push({ nome: namePart, cpf, horario: tm ? tm[1] : 'NÃO DEF.', status: 'Agendado', setor: activeSector });
            }
        }

        // Strategy 2: Formatted CPF
        if (!(/data\s*(de\s*)?nascimento/i.test(trimmed))) {
            const cpfF = trimmed.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
            if (cpfF) {
                const name = trimmed.split(cpfF[1])[0].replace(/[^A-ZÀ-Üa-zà-ü\s]/g, '').trim().toUpperCase();
                if (name.length > 4 && !equipe.some(e => e.cpf === cpfF[1])) {
                    const tm = trimmed.match(/(\d{2}:\d{2})/);
                    equipe.push({ nome: name, cpf: cpfF[1], horario: tm ? tm[1] : 'NÃO DEF.', status: 'Agendado', setor: activeSector });
                }
            }
        }

        // Strategy 3: CAPS name + time
        const cn = trimmed.match(/([A-ZÀ-Ü]{2,}\s+[A-ZÀ-Ü]{2,}(\s+[A-ZÀ-Ü]{2,})*)/);
        const tp = trimmed.match(/(\d{2}:\d{2})/);
        if (cn && cn[1].length > 5 && tp && !/^(NOME|DATA|CPF|HORA|UNID|STATUS|PAGINA|AGENDA|NASCIMENTO)/i.test(cn[1])) {
            if (!equipe.some(e => e.nome === cn[1].trim())) {
                equipe.push({ nome: cn[1].trim(), cpf: 'NÃO INFORMADO', horario: tp[1], status: 'Agendado', setor: activeSector });
            }
        }
    }

    const seen = new Set();
    const unique = equipe.filter(p => { if (seen.has(p.nome)) return false; seen.add(p.nome); return true; });

    return { setor: setor || 'INSS', data_referencia: dataRef || new Date().toLocaleDateString('pt-BR'), equipe: unique, total: unique.length };
}

function formatCPF(d) {
    return d.length === 11 ? `${d.substring(0,3)}.${d.substring(3,6)}.${d.substring(6,9)}-${d.substring(9)}` : d;
}

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n🟢 PDFNice Server rodando em http://localhost:${PORT}`);
    console.log(`   POST http://localhost:${PORT}/api/extract\n`);
});
