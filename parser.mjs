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
//
//  FORMAT 5 — DETRAN RELATÓRIO DE AGENDAMENTO
//    Header: Relatório de Agendamento / Unidade de atendimento
//    Rows are columnar but often split across lines in text extraction.
// ══════════════════════════════════════════════════════════════

// ─── Shared Utilities ────────────────────────────────────────
const RE_DATE_START  = /^\d{2}\/\d{2}\/\d{4}/;
const RE_TIME_SIMPLE = /(\d{2}:\d{2})(?::\d{2})?/;
const NOISE_WORDS    = /^(Data|Hora|CPF|Nome|Tipo|Serviço|Servico|Atendimento|Página|Pagina|Status|Agendamento)$/i;

const SERVICE_KW = /cumprimento\s+de\s+exig[êe]ncia|atendimento\s+simplificado|carta\s+de\s+concess[aã]o|carta\s+de\s+benefício|extrato\s+para\s+imposto|concess[aã]o\s+de\s+benefício|revisão\s+de\s+benefício|revis[aã]o|recurso|habilitação|habilitacao|vistoria|licenciamen|transferên|CNH|aposentadoria|auxílio|pensão|abono|perícia/gi;

// Words that cannot be part of a person's name (for reverse-scan in Format 4)
const NAME_STOP_WORDS = new Set([
    'HORA','DATA','CPF','STATUS','SETOR','LOCAL','AGENDAMENTO','SISTEMA',
    'DETRAN','INSS','MAESTRO','AGENDAR','ATENDIMENTO','PENDENTE','AGENDADO',
    'VEICULO','VEÍCULO','HABILITAÇÃO','HABILITACAO','VISTORIA','LICENCIAMENTO',
    'TRANSFERÊNCIA','TRANSFERENCIA','CNH','CEILÂNDIA','CEILANDIA','BRASILIA',
    'BRASÍLIA','PLANALTO','HTTPS','HTTP','WWW','COM','GOV','DF','BR','NBS',
    'AUTORIZAÇÃO','AUTORIZACAO','EMPLACamento','TIPO','VISITANTE','CONTATO',
    'PREVISÃO','INTERNO','INFORMADO','COMPARECEU','TELEFONE','CANAL','CENTRAL',
    'INTRANET','NÃO', 'UNIDADE', 'SERVICO'
]);

function formatCPF(d) {
    const l = d.replace(/\D/g, '');
    if (l.length < 9 || l.length > 11) return d;
    const padded = l.padStart(11, '0');
    return padded.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function extractDate(text) {
    const m = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    return m ? m[1] : new Date().toLocaleDateString('pt-BR');
}

function extractSector(text) {
    // Try "Unidade: NNNNN - DESCRIPTION" first (Agenda Sucinta header)
    const unitM = text.match(/Unidade:\s*\d+\s*[-–]\s*([^\n]{5,60})/i);
    if (unitM) return unitM[1].trim().toUpperCase();
    // Try generic sector pattern
    const sectorM = text.match(/(?:Unidade|Órgão\s*Local|Setor|Local|Agência|Agencia)[:\-\s]+([\w\sçÇãÃáÁéÉíÍóÓúÚ\/\-\.]{5,60})/i);
    if (sectorM) return sectorM[1].trim().split(/\n/)[0].trim().toUpperCase();
    // Try "NA HORA CITY"
    const nahoraM = text.match(/NA HORA\s+([A-ZÇÃÁÉÍÓÚ]{4,})/i);
    if (nahoraM) return ('NA HORA ' + nahoraM[1].toUpperCase());
    return 'DESCONHECIDO';
}

function firstService(chunk) {
    const m = chunk.match(SERVICE_KW);
    return m ? m[0].trim().toUpperCase() : null;
}

function isNameWord(w) {
    if (!w || w.length < 2) return false;
    if (/^\d/.test(w)) return false;
    if (/[0-9\/\(\)\[\]@#%&+=<>]/.test(w)) return false;
    if (NAME_STOP_WORDS.has(w.toUpperCase())) return false;
    if (/^https?:/i.test(w)) return false;
    return /^[A-ZÀ-Ÿa-zà-ÿ''\-]+$/u.test(w);
}

function isPrepWord(w) {
    return /^(de|da|do|das|dos|e|na|no|nas|nos)$/i.test(w);
}

function dedup(arr) {
    const seen = new Set();
    return arr.filter(p => {
        const k = p.cpf + '|' + p.horario + '|' + p.nome.slice(0, 10);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

// ──────────────────────────────────────────────────────────────
//  FORMAT 1 — INSS SIMPLES
//  Handles both spaced and concatenated formats:
//    Spaced:  27/03/2026 07:30 372.***.***-15 JOSE ALVES...
//    Concat:  27/03/202607:30372.***.***-15JOSE ALVES...
// ──────────────────────────────────────────────────────────────
function normalizeINSSSimples(text) {
    // Insert spaces between concatenated Date+Time+CPF+Name tokens
    // Pattern: DD/MM/YYYYHH:MM... → DD/MM/YYYY HH:MM ...
    let t = text;
    // Separate date from time: 27/03/202607:30 → 27/03/2026 07:30
    t = t.replace(/(\d{2}\/\d{2}\/\d{4})(\d{2}:\d{2})/g, '$1 $2');
    // Separate time from masked CPF: 07:30372.***.***-15 → 07:30 372.***.***-15
    t = t.replace(/(\d{2}:\d{2})(\d{3}\.\*{3}\.\*{3}-\d{2})/g, '$1 $2');
    // Separate masked CPF from name: 372.***.***-15JOSE → 372.***.***-15 JOSE
    t = t.replace(/(\d{3}\.\*{3}\.\*{3}-\d{2})([A-ZÀ-Ÿa-zà-ÿ])/g, '$1 $2');
    return t;
}

function parseINSSSimples(text) {
    const equipe = [];
    let sector = extractSector(text);
    if (sector === 'DESCONHECIDO') sector = 'INSS';
    const dateRef = extractDate(text);

    // Normalize concatenated tokens before tokenizing
    const normalized = normalizeINSSSimples(text);

    const tokens = [];
    const tokRe = /\S+/g;
    let tm;
    while ((tm = tokRe.exec(normalized)) !== null) tokens.push({ w: tm[0], pos: tm.index });

    const cpfRe = /(\d{3}\.\*{3}\.\*{3}-\d{2})/g;
    let cm;
    while ((cm = cpfRe.exec(normalized)) !== null) {
        const cpfStr = cm[1];
        const cpfPos = cm.index;
        const cpfIdx = tokens.findIndex(t => t.pos === cpfPos);
        if (cpfIdx < 0) continue;

        // In Simples, Name is usually AFTER the Masked CPF
        const nameWords = [];
        for (let i = cpfIdx + 1; i < tokens.length && i < cpfIdx + 15; i++) {
            const word = tokens[i].w.toUpperCase();
            // Stop if we hit a date or time or next CPF
            if (RE_DATE_START.test(word) || /^\d{2}:\d{2}/.test(word) || word.includes('***')) break;
            if (NAME_STOP_WORDS.has(word)) break;
            nameWords.push(tokens[i].w);
        }

        let name = nameWords.join(' ').replace(/[^\wÀ-ÿ\s'\-]/gu, ' ').replace(/\s{2,}/g, ' ').trim();
        if (name.length < 2) name = 'NÃO IDENTIFICADO';

        // Extract Time (usually BEFORE the Masked CPF)
        let time = '00:00';
        for (let i = cpfIdx - 1; i >= 0 && i >= cpfIdx - 5; i--) {
            const tM = tokens[i].w.match(/(\d{2}:\d{2})(?::\d{2})?/);
            if (tM) {
                time = tM[1];
                break;
            }
        }
        
        // Sometimes time is right after CPF if column ordering is weird
        if (time === '00:00') {
            const afterCPF = normalized.slice(cpfPos + cpfStr.length, cpfPos + cpfStr.length + 100);
            const forwardM = afterCPF.match(/(\d{2}:\d{2})(?::\d{2})?/);
            if (forwardM) time = forwardM[1];
        }

        let service = 'GERAL';
        const svcM  = name.match(SERVICE_KW);
        if (svcM) {
            const p = name.toLowerCase().indexOf(svcM[0].toLowerCase());
            if (p > 3) { service = svcM[0].toUpperCase(); name = name.slice(0, p).trim(); }
        }

        equipe.push({ nome: name.toUpperCase(), cpf: cpfStr, horario: time, status: 'Agendado', setor: sector, servico: service, data: dateRef });
    }
    return { equipe, dateRef, sector };
}

// ──────────────────────────────────────────────────────────────
//  FORMAT 2 — INSS AGENDA SUCINTA
// ──────────────────────────────────────────────────────────────
function parseAgendaSucinta(text) {
    const equipe  = [];
    const sector  = extractSector(text) || 'INSS';
    const dateRef = extractDate(text);

    // Pattern: "NOME - Data de Nascimento" on its own segment gracefully allowing missing birthdate bodies
    const RE_ENTRY = /^(.+?)\s*[-–]?\s*Data\s+de\s+Nascimento/gim;

    let m;
    while ((m = RE_ENTRY.exec(text)) !== null) {
        const nameRaw = m[1].trim();
        // Skip single-word matches (likely column headers or noise)
        if (nameRaw.split(/\s+/).length < 2) continue;

        let name = nameRaw.replace(/[^\wÀ-ÿ\s'\-]/gu, ' ').replace(/\s{2,}/g, ' ').trim();
        if (name.length < 4) continue;

        // Search next ~400 chars for horário, service, bare CPF number
        const chunk = text.slice(m.index + m[0].length, m.index + m[0].length + 400);

        const timeM  = chunk.match(RE_TIME_SIMPLE);
        const time   = timeM ? timeM[1] : '00:00';

        const service = firstService(chunk);

        // Bare 9 to 11-digit CPF after keyword "CPF"
        let cpf = 'NÃO INFORMADO';
        const cpfRaw = chunk.match(/CPF[\s:]+([\d\.\-\s]{9,15})/i);
        if (cpfRaw) cpf = formatCPF(cpfRaw[1].replace(/\s/g, ''));

        equipe.push({ nome: name.toUpperCase(), cpf, horario: time, status: 'Agendado', setor: sector, servico: service, data: dateRef });
    }
    return { equipe, dateRef, sector };
}

// ──────────────────────────────────────────────────────────────
//  FORMAT 3 — SEAP VISITANTE
//  Handles two layouts:
//    A) Horizontal: VISITANTE NOME DATE HH:MM - HH:MM ...
//    B) Vertical table (native PDF text extraction):
//       NOME\n DATE\n VISITANTE\n HH:MM - HH:MM\n ...
// ──────────────────────────────────────────────────────────────
function parseSEAP(text) {
    const equipe  = [];
    const dateRef = extractDate(text);
    const sector  = 'SEAP';
    const lines   = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Detect vertical table format: look for standalone "VISITANTE" lines
    const visitanteLineIdxs = [];
    for (let i = 0; i < lines.length; i++) {
        if (/^VISITAN?T[AE]$/i.test(lines[i])) {
            visitanteLineIdxs.push(i);
        }
    }

    if (visitanteLineIdxs.length > 2) {
        // --- VERTICAL TABLE FORMAT ---
        // Pattern: NOME / DATE / VISITANTE / TIME_RANGE / extra...
        // The NOME appears before the DATE+VISITANTE pair
        for (const vIdx of visitanteLineIdxs) {
            // Look backwards for date (should be 1 line before VISITANTE)
            let dateIdx = -1;
            for (let j = vIdx - 1; j >= Math.max(0, vIdx - 3); j--) {
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(lines[j])) {
                    dateIdx = j;
                    break;
                }
            }
            if (dateIdx < 0) continue;

            // Name is the line(s) before the date line
            // Collect name words going backwards from dateIdx, skipping noise
            const nameLines = [];
            for (let j = dateIdx - 1; j >= Math.max(0, dateIdx - 4); j--) {
                const ln = lines[j];
                // Stop at header keywords, page boundaries, or numeric IDs
                if (/^(NOME|PREVIS[ÃA]O|TIPO|CONTATO|INTERNO|[Úú]lt|Pagina|SECRETARIA|GOVERNO|\d{5,})/i.test(ln)) break;
                // Stop if it looks like a time range from previous entry
                if (/^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(ln)) break;
                // Stop at "Não Informado" (belongs to previous record)
                if (/^N[ãa]o\s+Informado$/i.test(ln)) break;
                nameLines.unshift(ln);
            }

            let name = nameLines.join(' ').replace(/\s{2,}/g, ' ').trim();
            // Clean phone numbers
            name = name.replace(/(?:\(?0?\d{2}\)?\s*)?9?\d{4}[-]?\d{4}\b/g, '').trim();
            name = name.replace(/[\d\(\)\-\.]+$/g, '').trim();
            if (name.length < 3) continue;

            // Look forward for time range (HH:MM - HH:MM)
            let time = '00:00';
            let entryDate = lines[dateIdx];
            for (let j = vIdx + 1; j <= Math.min(lines.length - 1, vIdx + 3); j++) {
                const timeM = lines[j].match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
                if (timeM) {
                    time = timeM[1];
                    break;
                }
            }

            equipe.push({ nome: name.toUpperCase(), cpf: 'NÃO INFORMADO', horario: time, status: 'Agendado', setor: sector, servico: 'VISITA', data: entryDate || dateRef });
        }
    }

    // --- HORIZONTAL ROW FORMAT (original logic, as fallback) ---
    if (equipe.length === 0) {
        const flat = [];
        let cur = null;
        for (const line of lines) {
            if (/^VISITAN?T[AE]/i.test(line) && line.length > 12) { if (cur) flat.push(cur); cur = line; }
            else if (cur && !RE_DATE_START.test(line) && !NOISE_WORDS.test(line)) { cur += ' ' + line; }
            else if (cur) { flat.push(cur); cur = null; }
        }
        if (cur) flat.push(cur);

        const RE_ROW = /^VISITAN?T[AE]\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/i;
        for (const row of flat) {
            const m = row.match(RE_ROW);
            if (!m) continue;
            let name = m[1].trim().replace(/\s{2,}/g, ' ');
            name = name.replace(/(?:\(?0?\d{2}\)?\s*)?9?\d{4}-?\d{4}\b/g, '').trim();
            name = name.replace(/[\d\(\)\-\.]+$/g, '').trim();
            const time = m[3];
            equipe.push({ nome: name.toUpperCase(), cpf: 'NÃO INFORMADO', horario: time, status: 'Agendado', setor: sector, servico: 'VISITA', data: m[2] || dateRef });
        }
    }

    return { equipe, dateRef, sector };
}

function parseDetran(text) {
    const equipe  = [];
    const dateRef = extractDate(text);
    const sector  = extractSector(text) || 'DETRAN';

    // Tokenise into words with positions
    const tokens = [];
    const tokRe  = /\S+/g;
    let tm;
    while ((tm = tokRe.exec(text)) !== null) tokens.push({ w: tm[0], pos: tm.index });

    const cpfRe = /(\d{3}\.\d{3}\.\d{3}-\d{2})/g;
    let cm;
    while ((cm = cpfRe.exec(text)) !== null) {
        const cpfStr = cm[1];
        const cpfPos = cm.index;
        const cpfIdx = tokens.findIndex(t => t.pos === cpfPos);
        if (cpfIdx < 0) continue;

        const nameWords = [];
        for (let i = cpfIdx - 1; i >= 0; i--) {
            const word = tokens[i].w.toUpperCase();
            if (NAME_STOP_WORDS.has(word)) {
                break;
            }
            nameWords.unshift(tokens[i].w);
        }

        const name = nameWords.join(' ').trim();
        if (name.length < 4 || name.split(' ').length < 2) continue;

        // Time after CPF
        const afterCPF = text.slice(cpfPos + cpfStr.length, cpfPos + cpfStr.length + 200);
        const timeM    = afterCPF.match(RE_TIME_SIMPLE);
        const time     = timeM ? timeM[1] : '00:00';

        // Service before name
        const nameStartIdx = cpfIdx - nameWords.length;
        const nameStartPos = nameStartIdx >= 0 ? tokens[nameStartIdx].pos : cpfPos;
        const beforeName   = text.slice(Math.max(0, nameStartPos - 250), nameStartPos);
        const service      = firstService(beforeName);

        equipe.push({ nome: name.toUpperCase(), cpf: formatCPF(cpfStr), horario: time, status: 'Pendente', setor: sector, servico: service, data: dateRef });
    }
    return { equipe, dateRef, sector };
}

// ──────────────────────────────────────────────────────────────
//  FORMAT 5 — DETRAN RELATÓRIO DE AGENDAMENTO
// ──────────────────────────────────────────────────────────────
function parseDetranReport(text) {
    const equipe  = [];
    const dateRef = extractDate(text);
    const sector  = extractSector(text) || 'DETRAN';

    // In Detran Reports, data is often spread across multiple lines.
    // We look for CPF patterns (with or without masks) and then scan nearby.
    const tokens = [];
    const tokRe  = /\S+/g;
    let tm;
    while ((tm = tokRe.exec(text)) !== null) tokens.push({ w: tm[0], pos: tm.index });

    // Look for CPF patterns: 000.000.000-00 or 000.000.000- (split) or 00000000000
    const cpfPatterns = [
        /(\d{3}\.\d{3}\.\d{3}-\d{2})/,
        /(\d{3}\.\d{3}\.\d{3}-)/,
        /(\d{11})/
    ];

    for (let i = 0; i < tokens.length; i++) {
        let cpf = '';
        let foundPattern = -1;
        
        for (let pIdx = 0; pIdx < cpfPatterns.length; pIdx++) {
            if (cpfPatterns[pIdx].test(tokens[i].w)) {
                cpf = tokens[i].w.match(cpfPatterns[pIdx])[1];
                foundPattern = pIdx;
                break;
            }
        }

        if (foundPattern === -1) continue;

        // If it's a split CPF (ending in dash), try to find the suffix nearby
        if (foundPattern === 1 && i + 1 < tokens.length && /^\d{2}$/.test(tokens[i+1].w)) {
            cpf += tokens[i+1].w;
        }

        const formattedCpf = formatCPF(cpf);
        if (formattedCpf.includes('*') || formattedCpf === 'NÃO INFORMADO') continue;

        // Found a CPF. Now find Name (usually before or in same line) and Time (usually after)
        // Scan backwards for Name
        const nameWords = [];
        for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
            const word = tokens[j].w.toUpperCase();
            if (NAME_STOP_WORDS.has(word) || RE_DATE_START.test(word) || /^\d{2}:\d{2}/.test(word)) break;
            if (/^\d{3,}/.test(word) && !word.includes('.')) break; // Likely a protocol or ID
            nameWords.unshift(tokens[j].w);
        }

        // Scan forwards for more name words (sometimes name follows CPF or is on next line)
        for (let j = i + 1; j < Math.min(tokens.length, i + 10); j++) {
            const word = tokens[j].w.toUpperCase();
            if (NAME_STOP_WORDS.has(word) || RE_DATE_START.test(word) || /^\d{2}:\d{2}/.test(word)) break;
            if (/^[0-9.-]{5,}$/.test(word)) break;
            nameWords.push(tokens[j].w);
        }

        let name = nameWords.join(' ').trim();
        // Clean name from common prefixes like "Habitação", "Veículo", etc if they got caught
        name = name.replace(/^(Ve[íi]culo|Habitac|Habilita[çc][ãa]o|e\/ou|\(NA\s+HORA\)|atendiment[eo]|Unidade|idad[ãa]‹?|A[çc][õo]es|\s+)+/gi, '').trim();
        
        // If name is purely numeric, it's likely the CPF duplicated in the name column
        if (/^\d[\d.-]*$/.test(name)) name = 'NÃO INFORMADO';
        
        if (name.length < 3 || name.split(' ').length < 1) continue;

        // Final polishing: remove any trailing suffix that matches the CPF suffix
        const suffix = formattedCpf.slice(-2);
        if (name.endsWith(' ' + suffix)) name = name.slice(0, -3).trim();

        // Time search forwards
        let time = '00:00';
        for (let j = i + 1; j < Math.min(tokens.length, i + 20); j++) {
            const tM = tokens[j].w.match(RE_TIME_SIMPLE);
            if (tM) {
                time = tM[1];
                break;
            }
        }

        // Service search backwards
        const service = firstService(text.slice(Math.max(0, tokens[i].pos - 500), tokens[i].pos));

        equipe.push({ 
            nome: name.toUpperCase(), 
            cpf: formattedCpf, 
            horario: time, 
            status: 'Pendente', 
            setor: sector, 
            servico: service, 
            data: dateRef 
        });
    }

    return { equipe, dateRef, sector };
}


// ──────────────────────────────────────────────────────────────
//  FORMAT 6 — SEDES EXCEL (CSV)
// ──────────────────────────────────────────────────────────────
function parseSedesExcel(text) {
    const equipe = [];
    let dateRef = extractDate(text);
    let sector = 'SEDES';
    const lines = text.split('\n');

    // Find the header line to map columns
    let headers = [];
    let dataStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].split(',');
        if (line.some(h => h.toLowerCase().includes('servidor')) && 
            line.some(h => h.toLowerCase().includes('usuario'))) {
            headers = line.map(h => h.trim().toLowerCase());
            dataStartLine = i + 1;
            break;
        }
    }

    if (dataStartLine === -1) return { equipe: [], dateRef, sector };

    const idxNome = headers.findIndex(h => h === 'usuario');
    const idxHora = headers.findIndex(h => h === 'hora');
    const idxData = headers.findIndex(h => h === 'data');
    const idxSrv  = headers.findIndex(h => h.includes('servidor'));

    for (let i = dataStartLine; i < lines.length; i++) {
        const row = lines[i].split(',');
        if (row.length < headers.length || !row[idxNome]) continue;

        const nome = row[idxNome].trim();
        const hora = row[idxHora]?.trim();
        const data = row[idxData]?.trim();
        const srv  = row[idxSrv]?.trim();

        if (nome.length < 3 || !hora) continue;
        if (nome.toLowerCase().includes('usuario')) continue; // Header repeat

        equipe.push({
            nome: nome.toUpperCase(),
            cpf: 'NÃO INFORMADO',
            horario: hora,
            status: 'Agendado',
            setor: sector,
            servico: srv ? srv.toUpperCase() : 'GERAL',
            data: data || dateRef
        });
    }

    return { equipe, dateRef, sector };
}

// ══════════════════════════════════════════════════════════════
//  MASTER ENTRY POINT — Auto-detects format then dispatches
// ══════════════════════════════════════════════════════════════
export function parseINSSText(rawText) {
    // Clean control chars but keep whitespace and newlines
    const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\0/g, '');

    // Detect garbled/binary text from PDFs with custom embedded fonts
    // These PDFs produce text with high ratio of control characters and no readable content
    const controlCharCount = (text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
    const printableCount = (text.match(/[a-zA-ZÀ-ÿ0-9]/g) || []).length;
    if (text.length > 500 && printableCount < text.length * 0.05) {
        // Less than 5% printable characters → garbled PDF, needs OCR
        return {
            formato: 'Texto ilegível (necessita OCR)',
            setor: 'DESCONHECIDO',
            data_referencia: new Date().toLocaleDateString('pt-BR'),
            equipe: [],
            total: 0
        };
    }

    const maskedCt = (text.match(/\d{3}\.\*{3}\.\*{3}-\d{2}/g) || []).length;
    const fullCt   = (text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/g) || []).length;
    const hasNasc  = /Data\s+de\s+Nascimento/i.test(text);
    const hasSeap  = /VISITAN?T[AE]/i.test(text) && /PREVIS[AÃ]O\s+DE\s+ATENDIMENTO/i.test(text);
    const hasDetranReport = /Relat[óo]rio\s+de\s+Agendamento/i.test(text) && /Unidade\s+de\s+atendimento/i.test(text);
    const hasSedesExcel = /Servidor\s+Nome/i.test(text) && /Usuario/i.test(text) && text.includes(',');

    let fmt, result;

    if (hasSedesExcel) {
        fmt    = 'SEDES Excel';
        result = parseSedesExcel(text);
    } else if (hasDetranReport) {
        fmt    = 'Detran Relatório de Agendamento';
        result = parseDetranReport(text);
    } else if (hasNasc) {
        fmt    = 'INSS Agenda Sucinta';
        result = parseAgendaSucinta(text);
    } else if (hasSeap) {
        fmt    = 'SEAP Visitante';
        result = parseSEAP(text);
    } else if (maskedCt > 0) {
        fmt    = 'INSS Simples';
        result = parseINSSSimples(text);
    } else if (fullCt > 0) {
        fmt    = 'Detran / CPF Completo';
        result = parseDetran(text);
    } else {
        fmt    = 'Formato não reconhecido';
        result = { equipe: [], dateRef: '', sector: '' };
    }

    
    

    const unique = dedup(result.equipe);
    return {
        formato: fmt,
        setor: result.sector || 'DESCONHECIDO',
        data_referencia: result.dateRef || new Date().toLocaleDateString('pt-BR'),
        equipe: unique,
        total: unique.length
    };
}
