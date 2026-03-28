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

// ─── Shared Patterns ─────────────────────────────────────────
const RE_ENTRY = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})\s+(\d{3}\.\*{3}\.\*{3}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{3}\*{3}\*{3}\d{2})\s*(.*)/;
const RE_DATE_AT_START = /^\d{2}\/\d{2}\/\d{4}/;
const RE_CPF_ANYWHERE = /(\d{3}[.*]*\d{3}[.*]*\d{3}[-.*]*\d{2})/;
const RE_TIME = /\b(\d{1,2}:\d{2})\b/;
const RE_SECTOR = /(?:Unidade|Órgão\s*Local|Org.o\s*Local|Setor|Local|Agência|Agencia)[:\-\s]+([\w\s\/\-\.]+)/i;

const NOISE_WORDS = /^(Data|Hora|CPF|Nome|Serviço|Servico|Atendimento|Página|Pagina|Status|Agendamento|ID|NB|Número|Numero|Doc|Tipo|Assunto)$/i;
const SERVICE_KEYWORDS = /cumprimento|exig[êe]ncia|concess[aã]o|revis[aã]o|recurso|habilitação|perícia|pericia|benefício|beneficio|salário|salario|aposentadoria|auxílio|auxilio|pensão|pensao|abono/i;

function cleanName(raw) {
    // Remove numbers, punctuation (except hyphens inside names), tab, normalize spaces
    return raw.replace(/\t/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .replace(/[^\wÀ-ÿ\s'\-]/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();
}

function isJunkLine(line) {
    if (!line || line.length < 2) return true;
    if (/^\s*[-–—_=*]{3,}/.test(line)) return true;          // separator lines
    if (/^\d+$/.test(line.trim())) return true;              // pure numbers
    if (NOISE_WORDS.test(line.trim())) return true;          // header words alone
    return false;
}

function formatCPF(d) {
    const limpo = d.replace(/\D/g, '');
    if (limpo.length !== 11) return d;
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function parseINSSText(rawText) {
    // Normalize: replace \r\n and \r with \n, remove BOM/null bytes
    const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\0/g, '');
    const lines = text.split('\n');

    const equipe = [];
    let sector = '';
    let dateRef = '';

    // ── Step 1: Extract header metadata (sector, date) ───────
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i].trim();
        if (!dateRef) {
            const dm = line.match(/(\d{2}\/\d{2}\/\d{4})/);
            if (dm) dateRef = dm[1];
        }
        const sm = line.match(RE_SECTOR);
        if (sm) {
            const candidate = sm[1].trim().split(/\s+\d{2}\/\d{2}/)[0].trim();
            if (candidate.length > 3 && !NOISE_WORDS.test(candidate)) {
                sector = candidate.toUpperCase();
            }
        }
    }

    // ── Step 2: Pre-join multi-line entries ──────────────────
    // Strategy: Build a list of "entry lines" by joining continuation lines
    // A continuation line is one that does NOT start with a date
    const entryLines = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (isJunkLine(trimmed)) continue;

        if (RE_DATE_AT_START.test(trimmed)) {
            // This starts a new entry
            if (current !== null) entryLines.push(current);
            current = trimmed;
        } else if (current !== null) {
            // This is a continuation of the previous entry (name overflow)
            // Stop joining if it looks like a new section or header
            if (!NOISE_WORDS.test(trimmed) && !RE_SECTOR.test(trimmed)) {
                current = current + ' ' + trimmed;
            } else {
                entryLines.push(current);
                current = null;
            }
        } else {
            // Format B: line without date — could have CPF + name without date prefix
            if (RE_CPF_ANYWHERE.test(trimmed)) {
                entryLines.push(trimmed);
            }
        }
    }
    if (current !== null) entryLines.push(current);

    // ── Step 3: Parse each joined entry ──────────────────────
    for (const entry of entryLines) {
        const matchA = entry.match(RE_ENTRY);

        if (matchA) {
            // Format A: DATE TIME CPF [NAME...]
            const [, date, time, cpf, nameRaw] = matchA;
            if (!dateRef) dateRef = date;

            let name = cleanName(nameRaw);

            // Name must have at least 2 chars; if empty, mark as unknown
            if (name.length < 2) name = 'NÃO IDENTIFICADO';

            // Detect if name contains service keywords
            let service = 'GERAL';
            const serviceM = name.match(SERVICE_KEYWORDS);
            if (serviceM) {
                // Split at the service keyword to isolate real name from service desc
                const parts = name.split(serviceM[0]);
                if (parts[0].trim().length > 3) {
                    name = parts[0].trim();
                    service = serviceM[0].trim().toUpperCase();
                }
            }

            equipe.push({
                nome: name.toUpperCase(),
                cpf: formatCPF(cpf),
                horario: time,
                status: cpf.includes('*') ? 'Agendado (CPF Oculto)' : 'Agendado',
                setor: sector || 'INSS',
                servico: service,
                data: date
            });

        } else {
            // Format B: No date prefix. Look for CPF anywhere
            const cpfM = entry.match(RE_CPF_ANYWHERE);
            if (!cpfM) continue;

            const cpf = cpfM[1];

            // Split around CPF to get what's before and after
            const [before, after] = entry.split(cpf);

            const timeM = entry.match(RE_TIME);
            const time = timeM ? timeM[1] : '00:00';

            // Determine name: usually before CPF (cleaned from date/time)
            let nameRaw = (before || '').replace(RE_TIME, '').replace(RE_DATE_AT_START, '').replace(/[:\-]/g, ' ').trim();
            let name = cleanName(nameRaw);

            // Detect service in the "after" part
            let service = 'GERAL';
            if (after) {
                const serviceM = after.match(SERVICE_KEYWORDS);
                if (serviceM) service = serviceM[0].trim().toUpperCase();
            }

            if (name.length > 3) {
                equipe.push({
                    nome: name.toUpperCase(),
                    cpf: formatCPF(cpf),
                    horario: time,
                    status: 'Agendado',
                    setor: sector || 'INSS',
                    servico: service,
                    data: dateRef
                });
            }
        }
    }

    // ── Step 4: Remove duplicates by CPF ─────────────────────
    const seen = new Set();
    const unique = equipe.filter(p => {
        const key = p.cpf + p.horario;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return {
        setor: sector || 'INSS',
        data_referencia: dateRef || new Date().toLocaleDateString('pt-BR'),
        equipe: unique,
        total: unique.length
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
