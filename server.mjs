import express from 'express';
import multer from 'multer';
import { pdf } from 'pdf-to-img';
import Tesseract from 'tesseract.js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.mjs';
import logger from './logger.mjs';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const fs = require('fs');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const corsOptions = {
  origin: function (origin, callback) {
    if (config.cors.whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}
app.use(cors(corsOptions));
app.use(express.json());

// ─── Static Files ───────────────────────────────────────────
const distPath = path.resolve(__dirname, 'dist');

if (fs.existsSync(distPath)) {
    logger.info(`[Server] Pasta 'dist' encontrada em: ${distPath}`);
    app.use(express.static(distPath));
} else {
    logger.info(`[Server] Pasta 'dist' não encontrada. Servindo da raiz: ${__dirname}`);
    app.use(express.static(__dirname));
}

import { parseINSSText } from './parser.mjs';

// ══════════════════════════════════════════════════════════════
//  SMART PARSER — 4 FORMATS AUTO-DETECTED
//
//  FORMAT 1 — INSS SIMPLES
//    Rows:  DD/MM/YYYY HH:MM 372.***.***-15 NOME...
//    Nome can overflow to next lines
//
//  FORMAT 2 — INSS AGENDA SUCINTA
//    Rows:  NOME COMPLETO - Data de Nascimento: DD/MM/YYYY
//           HH:MM  Serviço   CPF  xxxxxxxxxxx  ...
//
//  FORMAT 3 — SEAP VISITANTE
//    Rows:  VISITANTE  NOME  DATE  HH:MM - HH:MM  ...
//    No CPF available
//
//  FORMAT 4 — DETRAN / TABELA CPF COMPLETO
//    Rows:  UNIDADE  SERVICO  NOME  123.456.789-10  DATE  HH:MM ...
//    Name is BEFORE the full CPF → reverse token scan
// ══════════════════════════════════════════════════════════════


// ─── API Routes ──────────────────────────────────────────────

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === config.auth.username && password === config.auth.password) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

app.post('/api/extract', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        const pdfBuffer = req.file.buffer;
        let fullText = '';
        let pageNum = 0;
        let isNativeText = false;

        // 1. Try Native PDF Text Extraction
        try {
            logger.info('[Server] Tentando extração nativa...');
            const data = await pdfParse(pdfBuffer);
            if (data && data.text && data.text.trim().length > 100) {
               fullText = data.text;
               pageNum = data.numpages || 1;

               const tryParsed = parseINSSText(fullText);
               if (tryParsed.equipe.length > 0) {
                   isNativeText = true;
                   logger.info(`[Server] Nativo validado: ${tryParsed.equipe.length} registros.`);
               } else {
                   logger.info('[Server] Nativo sem registros → fallback OCR.');
               }
            }
        } catch (e) {
            logger.warn('[Server] Falha na extração nativa:', e.message);
            // Don't return, proceed to OCR fallback
        }

        // 2. OCR Fallback
        if (!isNativeText) {
            try {
                logger.info('[Server] Iniciando OCR (pdf-to-img + Tesseract)...');
                const pages = await pdf(pdfBuffer, { scale: 2.0 });
                const worker = await Tesseract.createWorker(config.ocr.language);

                for await (const pageImage of pages) {
                    pageNum++;
                    const { data: { text } } = await worker.recognize(pageImage);
                    fullText += `--- PÁGINA ${pageNum} ---\n${text}\n\n`;
                }
                await worker.terminate();
            } catch (ocrError) {
                logger.error('API /extract OCR Error:', ocrError);
                return res.status(500).json({ error: 'Erro durante o processamento de OCR do PDF.' });
            }
        }

        const parsed = parseINSSText(fullText);

        res.json({
            success: true,
            pages: pageNum,
            rawText: fullText,
            parsed
        });

    } catch (error) {
        logger.error('API /extract Error:', error);
        res.status(500).json({ error: 'Erro no processamento do PDF.' });
    }
});

// Serve index.html as fallback (Regex for Express 5 compatibility)
app.get(/.*/, (req, res) => {
    try {
        const indexPath = fs.existsSync(path.join(distPath, 'index.html'))
            ? path.join(distPath, 'index.html')
            : path.join(__dirname, 'index.html');

        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send('Frontend não encontrado. Certifique-se de que o build foi realizado.');
        }
    } catch (err) {
        logger.error('[Server] Erro ao servir index.html:', err);
        res.status(500).send('Erro interno ao carregar o frontend.');
    }
});

const PORT = config.server.port;
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🟢 PDFNice Server: http://0.0.0.0:${PORT}`);
});
