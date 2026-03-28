import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { pdf } from 'pdf-to-img';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Configure multer for PDF uploads (in memory)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});


// ─── PDF Extract Endpoint ─────────────────────────────────────
app.post('/api/extract', upload.single('pdf'), async (req, res) => {
    console.log('[Server] PDF recebido:', req.file?.originalname, req.file?.size, 'bytes');

    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        const pdfBuffer = req.file.buffer;
        let fullText = '';
        let pageNum = 0;
        let isNativeText = false;

        // 1. Try Native PDF Text Extraction First
        try {
            console.log('[Server] Tentando extração de texto nativo (mais rápido)...');
            const data = await pdfParse(pdfBuffer);
            if (data && data.text && data.text.trim().length > 200) {
               fullText = data.text;
               pageNum = data.numpages || 1;
               
               // Tentativa Especulativa: o texto tem +200 chars, mas pode ser lixo vetorial mal formatado
               const tryParsed = parseINSSText(fullText);
               if (tryParsed.equipe.length > 0) {
                   isNativeText = true;
                   console.log(`[Server] Texto nativo validado: ${fullText.length} chars, ${pageNum} pág, ${tryParsed.equipe.length} registros!`);
               } else {
                   console.log('[Server] Texto vetorial extraído não possui registros padronizados (0 lidos). Possível divergência de layout nativo. Acionando Fallback OCR...');
                   isNativeText = false;
                   fullText = ''; // Reseta para o OCR capturar tudo novamente
               }
            } else {
               console.log('[Server] Texto nativo insuficiente (<200 chars). Arquivo deve ser PDF Escaneado/Imagem.');
            }
        } catch (e) {
            console.warn('[Server] Falha na extração nativa, caindo para OCR. Erro:', e.message);
        }

        // 2. Fallback for OCR (Tesseract)
        if (!isNativeText) {
            console.log('[Server] Convertendo PDF em imagens...');
            const pages = await pdf(pdfBuffer, { scale: 2.0 });

            console.log('[Server] Iniciando OCR com Tesseract.js...');
            const worker = await Tesseract.createWorker('por');

            for await (const pageImage of pages) {
                pageNum++;
                console.log(`[OCR] Processando página ${pageNum}...`);
                const { data: { text } } = await worker.recognize(pageImage);
                fullText += `--- PÁGINA ${pageNum} ---\n${text}\n\n`;
                console.log(`[OCR] Página ${pageNum}: ${text.length} chars extraídos`);
            }

            await worker.terminate();
            console.log(`[Server] OCR completo. Total: ${fullText.length} chars`);
        }

        // Parse the text
        const parsed = parseINSSText(fullText);
        console.log(`[Server] Resultado: ${parsed.equipe.length} registros encontrados`);

        res.json({
            success: true,
            pages: pageNum,
            rawText: fullText,
            parsed
        });

    } catch (error) {
        console.error('Final /extract API error:', error);
        res.status(500).json({ error: 'Erro crítico interno no servidor ao processar o PDF.' });
    }
});

// ─── 4. Serve Frontend (Para Hospedagem em Produção) ──────────
// Serve os arquivos compilados do Vite (pasta dist)
app.use(express.static(path.join(__dirname, 'dist')));

app.use((req, res) => {
    if (req.method !== 'GET') return res.status(404).send('Not found');
    const distPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(distPath)) {
        res.sendFile(distPath);
    } else {
        res.status(200).send("<h3>API do PDFNice rodando!</h3><p>Para ver o site visual, certifique-se de compilar o frontend com 'npm run build', ou rode localmente com 'npm run dev'.</p>");
    }
});

// ─── INSS Text Parser ─────────────────────────────────────────
function parseINSSText(rawText) {
    const lines = rawText.split('\n');
    const equipe = [];
    let setor = '';
    let dataRef = '';
    let servicoGlobal = '';

    // If first line has date, extract it
    const dateHeaderMatch = lines[0] && lines[0].match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dateHeaderMatch) {
       dataRef = dateHeaderMatch[1];
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('---')) continue;

        // NEW FORMAT: 27/03/2026 07:30 372.***.***-15 JOSE ALVES DE (SOUSA na linha seguinte) ou tudo colado
        const novoFormatoMatch = trimmed.match(/^(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2})\s*(\d{3}\.[*\d]{3}\.[*\d]{3}-\d{2})\s*(.+)$/);
        
        if (novoFormatoMatch) {
            let [, data, hora, cpf, namePart] = novoFormatoMatch;
            dataRef = dataRef || data;
            
            // Check the next line to see if it's a continuation of the name
            let j = i + 1;
            let currentLineServico = 'GERAL';
            
            // Name continuation: next line doesn't start with a date or another pattern
            while (j < lines.length && lines[j].trim() !== '') {
               let nextTrimmed = lines[j].trim();
               // If next line looks like a new entry, break
               if (/^\d{2}\/\d{2}\/\d{4}/.test(nextTrimmed)) break;
               if (/^Data\s+Hora/.test(nextTrimmed)) break;
               
               namePart += " " + nextTrimmed;
               i = j; // Advance outer loop
               j++;
            }
            
            equipe.push({
                nome: namePart.toUpperCase(),
                cpf: cpf.includes('*') ? 'OCULTO (' + cpf + ')' : formatCPF(cpf.replace(/\D/g, '')),
                horario: hora,
                status: 'Agendado',
                setor: setor || 'AGENDAMENTOS GERAL',
                servico: currentLineServico
            });
            continue;
        }

        // 1. Keywords (Sector/Global Service)
        const sectorMatch = trimmed.match(/(?:Unidade|[ÓO]rg[ãa]o\s*Local|Setor|Local|Ag[êe]ncia)[:\-\s]*((?!\d{2}\/\d{2})(?:[A-ZÀ-Üa-zà-ü0-9\-\.\/\s]+))/i);
        if (sectorMatch) {
            let possibleSector = sectorMatch[1].trim();
            possibleSector = possibleSector.split(/\s\d{2}\/\d{2}\/\d{4}/)[0].split(/\sCPF:/i)[0].trim();
            if (possibleSector.length > 3 && !/^(DATA|NOME|CPF|HORA|P[AÁ]GINA|ID)/i.test(possibleSector)) {
                setor = possibleSector.toUpperCase();
            }
        }

        const GlobalServiceMatch = trimmed.match(/(?:Servi[çc]o|Assunto|Atendimento|Tipo)[:\-\s]*([A-ZÀ-Üa-zà-ü0-9\-\.\/\s,]{3,50})/i);
        if (GlobalServiceMatch) {
            servicoGlobal = GlobalServiceMatch[1].trim().toUpperCase();
        }

        // 2. Date
        const dm = trimmed.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (dm && !dataRef) dataRef = dm[1];

        // 3. Granular Data Extraction per Entry
        const activeSector = setor || 'INSS (NÃO IDENTIFICADO)';
        const tm = trimmed.match(/(\d{2}:\d{2})/);
        
        let currentLineServico = servicoGlobal;
        if (tm) {
            const parts = trimmed.split(tm[1]);
            let textAfterTime = parts[1] ? parts[1].trim() : '';
            
            // Refined cleaning: Stop at CPF, Doc, or other column headers
            // Also stop at long numbers (Number column)
            textAfterTime = textAfterTime
                .split(/\sCPF/i)[0]
                .split(/\sDOC/i)[0]
                .split(/\sN[ÚU]MERO/i)[0]
                .split(/\s\d{8,}/)[0] // Stop at long numeric strings (Número/Solicitação)
                .replace(/[:\-]/g, ' ')
                .trim();

            if (textAfterTime.length > 2 && !/^(DATA|NOME|CPF|HORA|P[AÁ]GINA|ID|PAG|DOC)/i.test(textAfterTime)) {
                currentLineServico = textAfterTime.toUpperCase();
            }
        }

        // Strategy A: "Data de Nascimento" anchor
        if (/data\s*(de\s*)?nascimento/i.test(trimmed)) {
            const namePart = trimmed.split(/data\s*(de\s*)?nascimento/i)[0]
                .replace(/[-–—:]/g, ' ').replace(/[^A-ZÀ-Üa-zà-ü\s]/g, '').trim().toUpperCase();

            if (namePart.length > 4) {
                const cpfM = trimmed.match(/(\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2})/) || trimmed.match(/(\d{11})/);
                let cpf = cpfM ? formatCPF(cpfM[1].replace(/\D/g, '')) : 'NÃO INFORMADO';
                equipe.push({ 
                    nome: namePart, 
                    cpf, 
                    horario: tm ? tm[1] : 'NÃO DEF.', 
                    status: 'Agendado', 
                    setor: activeSector, 
                    servico: currentLineServico || 'GERAL' 
                });
            }
        }

        // Strategy B: Formatted CPF
        else {
            const cpfF = trimmed.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/);
            if (cpfF) {
                const name = trimmed.split(cpfF[1])[0].replace(/[^A-ZÀ-Üa-zà-ü\s]/g, '').trim().toUpperCase();
                if (name.length > 4 && !equipe.some(e => e.cpf === cpfF[1])) {
                    equipe.push({ 
                        nome: name, 
                        cpf: cpfF[1], 
                        horario: tm ? tm[1] : 'NÃO DEF.', 
                        status: 'Agendado', 
                        setor: activeSector, 
                        servico: currentLineServico || 'GERAL' 
                    });
                }
            }
            // Strategy C: CAPS name + time (Only if not already captured)
            else {
                const cn = trimmed.match(/([A-ZÀ-Ü]{2,}\s+[A-ZÀ-Ü]{2,}(\s+[A-ZÀ-Ü]{2,})*)/);
                if (cn && cn[1].length > 5 && tm && !/^(NOME|DATA|CPF|HORA|UNID|STATUS|PAGINA|AGENDA|NASCIMENTO|SERVICO|ASSUNTO)/i.test(cn[1])) {
                    if (!equipe.some(e => e.nome === cn[1].trim())) {
                        equipe.push({ 
                            nome: cn[1].trim(), 
                            cpf: 'NÃO INFORMADO', 
                            horario: tm[1], 
                            status: 'Agendado', 
                            setor: activeSector, 
                            servico: currentLineServico || 'GERAL' 
                        });
                    }
                }
            }
        }
    }

    const seen = new Set();
    const unique = equipe.filter(p => { 
        if (seen.has(p.nome)) return false; 
        seen.add(p.nome); 
        return true; 
    });

    return { 
        setor: setor || 'INSS', 
        data_referencia: dataRef || new Date().toLocaleDateString('pt-BR'), 
        equipe: unique, 
        total: unique.length 
    };
}

function formatCPF(d) {
    return d.length === 11 ? `${d.substring(0,3)}.${d.substring(3,6)}.${d.substring(6,9)}-${d.substring(9)}` : d;
}

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n🟢 PDFNice Server rodando em http://localhost:${PORT}`);
    console.log(`   POST http://localhost:${PORT}/api/extract\n`);
});
