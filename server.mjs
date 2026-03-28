import express from 'express';
import multer from 'multer';
import { pdf } from 'pdf-to-img';
import Tesseract from 'tesseract.js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const fs = require('fs');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ─── Static Files ───────────────────────────────────────────
const distPath = path.resolve(__dirname, 'dist');

if (fs.existsSync(distPath)) {
    console.log(`[Server] Pasta 'dist' encontrada em: ${distPath}`);
    app.use(express.static(distPath));
} else {
    console.log(`[Server] Pasta 'dist' não encontrada. Servindo da raiz: ${__dirname}`);
    app.use(express.static(__dirname));
}

// ─── Parsing Logic ───────────────────────────────────────────

function formatCPF(d) {
    const limpo = d.replace(/\D/g, '');
    if (limpo.length !== 11) return d;
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function parseINSSText(rawText) {
    const lines = rawText.split('\n');
    const equipe = [];
    let sector = '';
    let dateRef = '';
    let globalService = '';

    // Step 1: Detect Sector and Date from headers
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const line = lines[i].trim();
        const dateM = line.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (dateM && !dateRef) dateRef = dateM[1];

        const sectorM = line.match(/(?:Unidade|[ÓO]rg[ãa]o\s*Local|Setor|Local|Ag[êe]ncia)[:\-\s]*((?!\d{2}\/\d{2})(?:[A-ZÀ-Üa-zà-ü0-9\-\.\/\s]+))/i);
        if (sectorM) {
            let possible = sectorM[1].trim().split(/\s\d{2}\/\d{2}/)[0].split(/\sCPF:/i)[0].trim();
            if (possible.length > 3 && !/^(DATA|NOME|CPF|HORA)/i.test(possible)) {
                sector = possible.toUpperCase();
            }
        }
    }

    // Step 2: Dynamic Sweep per row
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line || line.startsWith('---') || line.length < 10) continue;

        // Anchor Pattern 1: CPF (Crucial)
        // Matches: 123.456.789-10 or 12345678910 or 123.***.***-10
        const cpfPattern = /(\d{3}[.\s*]*\d{3}[.\s*]*\d{3}[-.\s*]*\d{2})/g;
        const timePattern = /(\d{1,2}:\d{2})/;
        
        const cpfMatch = line.match(cpfPattern);
        
        if (cpfMatch) {
            const cpf = cpfMatch[0];
            const timeMatch = line.match(timePattern);
            const time = timeMatch ? timeMatch[0] : '00:00';
            
            // Now the tricky part: Split the line into segments to find the NAME and SERVICE
            // Usually: [NAME] [SERVICE] [CPF] [OTHER] or [NAME] [CPF] [TIME] etc.
            
            // Remove the CPF and Time from the line to see what's left
            let content = line.replace(cpf, ' [CPF] ').replace(time, ' [TIME] ');
            
            // Heuristic for NAME: Usually at the start IF it contains 2+ words in CAPS
            // Heuristic for SERVICE: Usually between Name and CPF/Time, or at the end
            
            let parts = content.split(/\[CPF\]|\[TIME\]/);
            let name = 'NÃO IDENTIFICADO';
            let service = 'GERAL';
            
            // Clean parts
            let cleanParts = parts.map(p => p.replace(/[:\-]/g, ' ').trim()).filter(p => p.length > 2);
            
            if (cleanParts.length > 0) {
                // The longest part with multiple capitalized words is likely the Name
                const capsWords = cleanParts.filter(p => /([A-ZÀ-Ü]{3,}\s+[A-ZÀ-Ü]{2,})/.test(p));
                if (capsWords.length > 0) {
                    name = capsWords[0].toUpperCase();
                    // If multiple parts, the other one is likely the service
                    if (cleanParts.length > 1) {
                        service = cleanParts.find(p => p !== capsWords[0]) || 'GERAL';
                    }
                } else {
                    // Fallback: use first part as name
                    name = cleanParts[0].toUpperCase();
                    if (cleanParts.length > 1) service = cleanParts[1];
                }
            }

            // Refine service (remove common noises)
            service = service.replace(/\s\d{8,}/, '').replace(/Data de Nascimento/i, '').trim().toUpperCase();
            if (service.length < 3 || /^(CPF|DATA|DOC|NB|ID|NASC)/i.test(service)) service = 'GERAL';

            equipe.push({
                nome: name.replace(/[^A-ZÀ-Ü\s]/g, '').trim(),
                cpf: cpf.includes('*') ? `OCULTO (${cpf})` : formatCPF(cpf),
                horario: time,
                status: 'Agendado',
                setor: sector || 'INSS',
                servico: service
            });
        }
        else {
            // Backup Strategy: "Data de Nascimento" anchor (covers multiline or displaced records)
            if (/data\s*(de\s*)?nascimento/i.test(line)) {
                const parts = line.split(/data\s*(de\s*)?nascimento/i);
                const nameCandidate = parts[0].replace(/[-–—:]/g, ' ').replace(/[^A-ZÀ-Üa-zà-ü\s]/g, '').trim().toUpperCase();
                
                if (nameCandidate.length > 5) {
                    const timeMatch = line.match(timePattern);
                    const time = timeMatch ? timeMatch[0] : '00:00';
                    equipe.push({
                        nome: nameCandidate,
                        cpf: 'NÃO INFORMADO',
                        horario: time,
                        status: 'Agendado',
                        setor: sector || 'INSS',
                        servico: 'GERAL'
                    });
                }
            }
        }
    }

    const seen = new Set();
    const unique = equipe.filter(p => {
        const key = p.nome + (p.cpf === 'NÃO INFORMADO' ? Math.random() : p.cpf);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return {
        setor: sector || 'INSS',
        dataRef: dateRef || new Date().toLocaleDateString('pt-BR'),
        equipe: unique
    };
}

// ─── API Routes ──────────────────────────────────────────────

app.post('/api/extract', upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    try {
        const pdfBuffer = req.file.buffer;
        let fullText = '';
        let pageNum = 0;
        let isNativeText = false;

        // 1. Try Native PDF Text Extraction
        try {
            console.log('[Server] Tentando extração nativa...');
            const data = await pdfParse(pdfBuffer);
            if (data && data.text && data.text.trim().length > 200) {
               fullText = data.text;
               pageNum = data.numpages || 1;
               
               const tryParsed = parseINSSText(fullText);
               if (tryParsed.equipe.length > 0) {
                   isNativeText = true;
                   console.log(`[Server] Nativo validado: ${tryParsed.equipe.length} registros found.`);
               } else {
                   console.log('[Server] Fallback OCR (0 registros no nativo).');
               }
            }
        } catch (e) {
            console.warn('[Server] Falha nativa:', e.message);
        }

        // 2. OCR Fallback
        if (!isNativeText) {
            console.log('[Server] Iniciando OCR...');
            const pages = await pdf(pdfBuffer, { scale: 2.0 });
            const worker = await Tesseract.createWorker('por');
            
            for await (const pageImage of pages) {
                pageNum++;
                const { data: { text } } = await worker.recognize(pageImage);
                fullText += `--- PÁGINA ${pageNum} ---\n${text}\n\n`;
            }
            await worker.terminate();
        }

        const parsed = parseINSSText(fullText);
        
        res.json({
            success: true,
            pages: pageNum,
            rawText: fullText,
            parsed
        });

    } catch (error) {
        console.error('API /extract Error:', error);
        res.status(500).json({ error: 'Erro no processamento do PDF.' });
    }
});

// Serve index.html as fallback for any unknown GET routes (Regex for Express 5 compatibility)
app.get(/.*/, (req, res) => {
    try {
        const indexPath = fs.existsSync(path.join(distPath, 'index.html')) 
            ? path.join(distPath, 'index.html') 
            : path.join(__dirname, 'index.html');
        
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send('Frontend não encontrado. Certifique-se de que o build foi realizado e a pasta "dist" existe.');
        }
    } catch (err) {
        console.error('[Server] Erro ao servir index.html:', err);
        res.status(500).send('Erro interno ao carregar o frontend.');
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🟢 PDFNice Server: http://0.0.0.0:${PORT}`);
});
