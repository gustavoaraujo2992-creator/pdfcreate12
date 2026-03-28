// ─── Testa os dois formatos de PDF extraídos ─────────────────
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
const req = createRequire(import.meta.url);

// ── Copia das funções do server.mjs (inline para teste) ──────

const STOP_WORDS = new Set([
    'HORA','DATA','CPF','NOME','STATUS','SETOR','LOCAL','AGENDAMENTO','SISTEMA',
    'DETRAN','INSS','MAESTRO','AGENDAR','ATENDIMENTO','PENDENTE','AGENDADO',
    'VEICULO','VEÍCULO','HABILITAÇÃO','HABILITACAO','VISTORIA','LICENCIAMENTO',
    'TRANSFERÊNCIA','TRANSFERENCIA','CNH','CEILÂNDIA','CEILANDIA',
    'BRASILIA','BRASÍLIA','PLANALTO','HTTPS','HTTP','WWW','COM','GOV','DF','BR',
    'NA','NBS','AUTORIZAÇÃO','AUTORIZACAO','EMPLACAMENTO',
]);
const NOISE_WORDS = /^(Data|Hora|CPF|Nome|Serviço|Servico|Atendimento|Página|Pagina|Status|Agendamento)$/i;
const SERVICE_KEYWORDS = /veículo|habilitação|habilitacao|vistoria|licenciamen|transferên|CNH|concess[aã]o|revis[aã]o|cumprimento|exig[êe]ncia|recurso|aposentadoria|auxílio|pensão|abono|perícia/i;
const RE_DATE_START  = /^\d{2}\/\d{2}\/\d{4}/;
const RE_SECTOR      = /(?:Unidade|Órgão\s*Local|Setor|Local|Agência|Agencia)[:\-\s]+([\w\sçÇãÃáÁéÉíÍóÓúÚ\/\-\.]+)/i;

function formatCPF(d) { const l = d.replace(/\D/g,''); if(l.length!==11)return d; return l.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
function isNameWord(w) {
    if (!w || w.length < 2) return false;
    if (/^\d/.test(w)) return false;
    if (/[0-9\/\(\)\[\]\{\}@#%^&+=<>]/.test(w)) return false;
    if (STOP_WORDS.has(w.toUpperCase())) return false;
    if (/^https?:/i.test(w)) return false;
    return /^[A-ZÀ-Ÿa-zà-ÿ''\-]+$/u.test(w);
}
function isPreposition(w) { return /^(de|da|do|das|dos|e|na|no|nas|nos|e\/ou)$/i.test(w); }

function parseINSSFormat(text) {
    const lines = text.split('\n');
    const equipe = []; let sector = ''; let dateRef = '';
    const RE_ENTRY_INSS = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})\s+(\d{3}\.\*{3}\.\*{3}-\d{2})\s*(.*)/;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i].trim();
        if (!dateRef) { const dm = line.match(/(\d{2}\/\d{2}\/\d{4})/); if (dm) dateRef = dm[1]; }
        const sm = line.match(RE_SECTOR);
        if (sm) { const c = sm[1].trim().split(/\s+\d{2}\/\d{2}/)[0].trim(); if (c.length>3&&!NOISE_WORDS.test(c)) sector = c.toUpperCase(); }
    }
    const entryLines = []; let current = null;
    for (const line of lines) {
        const t = line.trim(); if (!t || t.length < 2) continue;
        if (RE_DATE_START.test(t)) { if (current) entryLines.push(current); current = t; }
        else if (current) { if (!NOISE_WORDS.test(t)&&!RE_SECTOR.test(t)) current = current+' '+t; else { entryLines.push(current); current=null; } }
    }
    if (current) entryLines.push(current);
    for (const entry of entryLines) {
        const m = entry.match(RE_ENTRY_INSS); if (!m) continue;
        const [,date,time,cpf,nameRaw] = m; if (!dateRef) dateRef=date;
        let name = nameRaw.replace(/\t/g,' ').replace(/\s{2,}/g,' ').replace(/[^\wÀ-ÿ\s'\-]/gu,' ').replace(/\s{2,}/g,' ').trim();
        if (name.length < 2) name='NÃO IDENTIFICADO';
        let service='GERAL';
        const svcM = name.match(SERVICE_KEYWORDS);
        if (svcM) { const p=name.indexOf(svcM[0]); if(p>3){service=name.slice(p).trim().toUpperCase();name=name.slice(0,p).trim();} }
        equipe.push({nome:name.toUpperCase(),cpf:formatCPF(cpf),horario:time,status:'Agendado',setor:sector||'INSS',servico:service,data:date});
    }
    return {equipe, dateRef, sector};
}

function parseDetranFormat(text) {
    const equipe = []; let dateRef=''; let sector='DETRAN';
    const dateM = text.match(/(\d{2}\/\d{2}\/\d{4})/); if (dateM) dateRef=dateM[1];
    const unitM = text.match(/NA HORA\s+([A-ZÇÃÁÉÍÓÚ]+)/i); if (unitM) sector=('NA HORA '+unitM[1]).toUpperCase();
    const tokens = []; const tokRe = /\S+/g; let tm;
    while ((tm = tokRe.exec(text)) !== null) tokens.push({w: tm[0], pos: tm.index});
    const cpfRe = /(\d{3}\.\d{3}\.\d{3}-\d{2})/g; let cm;
    while ((cm = cpfRe.exec(text)) !== null) {
        const cpfStr=cm[1]; const cpfPos=cm.index;
        const cpfTokIdx = tokens.findIndex(t=>t.pos===cpfPos); if (cpfTokIdx<0) continue;
        const nameWords=[]; let prepStack=[];
        for (let i=cpfTokIdx-1;i>=0&&i>=cpfTokIdx-10;i--) {
            const word = tokens[i].w.replace(/[,\.;:]+$/,'');
            if (isPreposition(word)) { prepStack.unshift(word); continue; }
            if (isNameWord(word)) { nameWords.unshift(...prepStack,word); prepStack=[]; }
            else break;
        }
        const name = nameWords.join(' ').trim(); if (name.length<4) continue;
        const textAfterCPF = text.slice(cpfPos+cpfStr.length,cpfPos+cpfStr.length+100);
        const timeM2 = textAfterCPF.match(/(\d{2}:\d{2})/);
        const time = timeM2?timeM2[1]:'00:00';
        const nameStartPos = tokens[cpfTokIdx-nameWords.length]?tokens[cpfTokIdx-nameWords.length].pos:cpfPos;
        const textBeforeName = text.slice(Math.max(0,nameStartPos-200),nameStartPos);
        let service='GERAL';
        const svcM2 = textBeforeName.match(SERVICE_KEYWORDS); if (svcM2) service=svcM2[0].trim().toUpperCase();
        equipe.push({nome:name.toUpperCase(),cpf:formatCPF(cpfStr),horario:time,status:'Pendente',setor:sector,servico:service,data:dateRef});
    }
    return {equipe, dateRef, sector};
}

function parseAll(rawText) {
    const text = rawText.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\0/g,'');
    const maskedCount = (text.match(/\d{3}\.\*{3}\.\*{3}-\d{2}/g)||[]).length;
    const fullCount   = (text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/g)||[]).length;
    let result;
    if (maskedCount>=fullCount&&maskedCount>0) { console.log('→ Formato INSS'); result=parseINSSFormat(text); }
    else if (fullCount>0)                       { console.log('→ Formato Detran'); result=parseDetranFormat(text); }
    else                                        { console.log('→ Sem CPF reconhecido'); result={equipe:[],dateRef:'',sector:''}; }
    const seen=new Set();
    const unique=result.equipe.filter(p=>{const k=p.cpf+p.horario;if(seen.has(k))return false;seen.add(k);return true;});
    return {setor:result.sector,data_referencia:result.dateRef,equipe:unique,total:unique.length};
}

// ─── Teste 1: Formato INSS (arquivo existente) ───────────────
console.log('\n══════════════════════════════════════════');
console.log('TESTE 1 — Formato INSS (CPF mascarado)');
console.log('══════════════════════════════════════════');
if (existsSync('./output_pdf_new_py.txt')) {
    const inssText = readFileSync('./output_pdf_new_py.txt','utf-8');
    const r1 = parseAll(inssText);
    console.log(`Total extraído: ${r1.total} registros | Setor: ${r1.setor} | Data: ${r1.data_referencia}`);
    console.log('Primeiros 5 nomes:');
    r1.equipe.slice(0,5).forEach((p,i)=>console.log(`  ${i+1}. [${p.horario}] ${p.nome} | CPF: ${p.cpf}`));
} else {
    console.log('Arquivo ./output_pdf_new_py.txt não encontrado, pulando...');
}

// ─── Teste 2: Simulação Formato Detran ───────────────────────
console.log('\n══════════════════════════════════════════');
console.log('TESTE 2 — Formato Detran (CPF completo, nome antes)');
console.log('══════════════════════════════════════════');
const detranSimulado = `
27/03/2026, 07:16   AGENDAMENTO - Sistema de Agendamento do Detran

NA HORA CEILÂNDIA   Veículo e/ou Habilitação (Na Hora)   WALDIR OLIVEIRA DOS SANTOS   036.282.061-97   27/03/2026   07:30:00   07:45:00   202603/045592   Pendente
NA HORA CEILÂNDIA   Veículo e/ou Habilitação (Na Hora)   RAFAEL PIRES SOUSA   029.894.471-56   27/03/2026   08:00:00   08:15:00   202603/044751   Pendente
NA HORA CEILÂNDIA   Veículo e/ou Habilitação (Na Hora)   FERNANDA GOMES DAMACENA   024.878.801-98   27/03/2026   08:30:00   08:45:00   202603/045387   Pendente
NA HORA CEILÂNDIA   Veículo e/ou Habilitação (Na Hora)   DANIEL DE OLIVEIRA BARROSO   056.816.151-38   27/03/2026   09:30:00   09:45:00   202603/045364   Pendente
NA HORA CEILÂNDIA   Veículo e/ou Habilitação (Na Hora)   Caio Fernando Vieira Soares Rodrigues   040.163.801-46   27/03/2026   11:30:00   11:45:00   202603/035097   Pendente
`;
const r2 = parseAll(detranSimulado);
console.log(`Total extraído: ${r2.total} registros | Setor: ${r2.setor} | Data: ${r2.data_referencia}`);
console.log('Nomes encontrados:');
r2.equipe.forEach((p,i)=>console.log(`  ${i+1}. [${p.horario}] ${p.nome} | CPF: ${p.cpf} | Serviço: ${p.servico}`));
