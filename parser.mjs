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

// ─── Shared Utilities ────────────────────────────────────────
const RE_DATE_START  = /^\d{2}\/\d{2}\/\d{4}/;
const RE_TIME_SIMPLE = /\b(\d{2}:\d{2})(?::\d{2})?\b/;
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
    if (l.length !== 11) return d;
    return l.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
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
    return m ? m[0].trim().toUpperCase() : 'GERAL';
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
// ──────────────────────────────────────────────────────────────
function parseINSSSimples(text) {
    const lines  = text.split('\n');
    const equipe = [];
    let sector   = extractSector(text);
    const dateRef = extractDate(text);
    const RE_ROW = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(\d{3}\.\*{3}\.\*{3}-\d{2})\s*(.*)/;

    // Join continuation lines (name can overflow to next line)
    const joined = [];
    let cur = null;
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.length < 2) continue;
        if (RE_DATE_START.test(t)) { 
            if (cur) joined.push(cur); 
            cur = t; 
        } else if (cur) { 
            // Check if the line is likely a continuation of the name (e.g., doesn't contain time or other structured data)
            if (!RE_TIME_SIMPLE.test(t) && !NOISE_WORDS.test(t.split(' ')[0])) {
                cur += ' ' + t; 
            }
        }
    }
    if (cur) joined.push(cur);

    for (const entry of joined) {
        const m = entry.match(RE_ROW);
        if (!m) continue;
        const [, date, time, cpf, nameRaw] = m;

        let name = nameRaw.replace(/\t/g, ' ').replace(/\s{2,}/g, ' ')
                          .replace(/[^\wÀ-ÿ\s'\-]/gu, ' ').replace(/\s{2,}/g, ' ').trim();
        if (name.length < 2) name = 'NÃO IDENTIFICADO';

        let service = 'GERAL';
        const svcM  = name.match(SERVICE_KW);
        if (svcM) {
            const p = name.toLowerCase().indexOf(svcM[0].toLowerCase());
            if (p > 3) { service = svcM[0].toUpperCase(); name = name.slice(0, p).trim(); }
        }

        if (sector === 'DESCONHECIDO') sector = 'INSS';
        equipe.push({ nome: name.toUpperCase(), cpf: formatCPF(cpf), horario: time, status: 'Agendado', setor: sector, servico: service, data: date });
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

    // Pattern: "NOME - Data de Nascimento: DD/MM/YYYY" on its own segment
    const RE_ENTRY = /^(.+?)\s*-\s*Data\s+de\s+Nascimento:\s*\d{2}\/\d{2}\/\d{4}/gim;

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

        // Bare 11-digit CPF after keyword "CPF"
        let cpf = 'NÃO INFORMADO';
        const cpfRaw = chunk.match(/CPF\s+(\d{11})/i);
        if (cpfRaw) cpf = formatCPF(cpfRaw[1]);

        equipe.push({ nome: name.toUpperCase(), cpf, horario: time, status: 'Agendado', setor: sector, servico: service, data: dateRef });
    }
    return { equipe, dateRef, sector };
}

// ──────────────────────────────────────────────────────────────
//  FORMAT 3 — SEAP VISITANTE
// ──────────────────────────────────────────────────────────────
function parseSEAP(text) {
    const equipe  = [];
    const dateRef = extractDate(text);
    const sector  = 'SEAP';
    const lines   = text.split('\n');

    // Join multi-line name continuations within the same row
    const flat = [];
    let cur = null;
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.length < 2) continue;
        if (/^VISITAN?T[AE]/i.test(t)) { if (cur) flat.push(cur); cur = t; }
        else if (cur && !RE_DATE_START.test(t) && !NOISE_WORDS.test(t)) { cur += ' ' + t; }
        else if (cur) { flat.push(cur); cur = null; }
    }
    if (cur) flat.push(cur);

    // Extract name and time from each row
    const RE_ROW = /^VISITAN?T[AE]\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/i;
    for (const row of flat) {
        const m = row.match(RE_ROW);
        if (!m) continue;
        const name = m[1].trim().replace(/\s{2,}/g, ' ');
        const time = m[3];
        equipe.push({ nome: name.toUpperCase(), cpf: 'NÃO INFORMADO', horario: time, status: 'Agendado', setor: sector, servico: 'VISITA', data: m[2] || dateRef });
    }
    return { equipe, dateRef, sector };
}

// ──────────────────────────────────────────────────────────────
//  FORMAT 4 — DETRAN / TABELA CPF COMPLETO
// ──────────────────────────────────────────────────────────────
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
        const afterCPF = text.slice(cpfPos + cpfStr.length, cpfPos + cpfStr.length + 120);
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

// ══════════════════════════════════════════════════════════════
//  MASTER ENTRY POINT — Auto-detects format then dispatches
// ══════════════════════════════════════════════════════════════
export function parseINSSText(rawText) {
    const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\0/g, '');

    const maskedCt = (text.match(/\d{3}\.\*{3}\.\*{3}-\d{2}/g) || []).length;
    const fullCt   = (text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/g) || []).length;
    const hasNasc  = /Data\s+de\s+Nascimento/i.test(text);
    const hasSeap  = /VISITAN?T[AE]/i.test(text) && /PREVIS[AÃ]O\s+DE\s+ATENDIMENTO/i.test(text);

    let fmt, result;

    if (hasNasc) {
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
