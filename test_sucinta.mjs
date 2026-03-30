import { formatCPF } from './parser.mjs';

const NAME_STOP_WORDS = new Set([
    'HORA','DATA','CPF','STATUS','SETOR','LOCAL','AGENDAMENTO','SISTEMA',
    'DETRAN','INSS','MAESTRO','AGENDAR','ATENDIMENTO','PENDENTE','AGENDADO',
    'VEICULO','VEÍCULO','HABILITAÇÃO','HABILITACAO','VISTORIA','LICENCIAMENTO',
    'TRANSFERÊNCIA','TRANSFERENCIA','CNH','CEILÂNDIA','CEILANDIA','BRASILIA',
    'BRASÍLIA','PLANALTO','HTTPS','HTTP','WWW','COM','GOV','DF','BR','NBS',
    'AUTORIZAÇÃO','AUTORIZACAO','EMPLACAMENTO','TIPO','VISITANTE','CONTATO',
    'PREVISÃO','INTERNO','INFORMADO','COMPARECEU','TELEFONE','CANAL','CENTRAL',
    'INTRANET','NÃO','NIT','RG'
]);

const SERVICE_KW = /cumprimento\s+de\s+exig[êe]ncia|atendimento\s+simplificado|carta\s+de\s+concess[aã]o|carta\s+de\s+benefício|extrato\s+para\s+imposto|concess[aã]o\s+de\s+benefício|revisão\s+de\s+benefício|revis[aã]o|recurso|habilitação|habilitacao|vistoria|licenciamen|transferên|CNH|aposentadoria|auxílio|pensão|abono|perícia/gi;

function firstService(chunk) {
    const m = chunk.match(SERVICE_KW);
    return m ? m[0].trim().toUpperCase() : 'GERAL';
}

const RE_TIME_SIMPLE = /(\d{2}:\d{2})(?::\d{2})?/;

function parseAgendaSucinta2(text) {
    const equipe  = [];
    const tokens = [];
    const tokRe = /\S+/g;
    let tm;
    while ((tm = tokRe.exec(text)) !== null) tokens.push({ w: tm[0], pos: tm.index });

    for (let i = 0; i < tokens.length; i++) {
        if (!/NASCIMENTO:?/i.test(tokens[i].w)) continue;

        const nameWords = [];
        for (let j = i - 1; j >= 0 && j >= i - 18; j--) {
            const word = tokens[j].w.toUpperCase();
            // Skip "Data de"
            if (word === 'DE' && tokens[j-1] && /DATA/i.test(tokens[j-1].w)) { j--; continue; } 
            if (/DATA/i.test(word)) continue;
            if (word === '-' || word === '–') continue;
            
            // Break if we hit previous record's data
            if (/^\d{2}:\d{2}/.test(word) || /^[0-9]+$/.test(word) || /CPF/i.test(word) || /^([(]?\d{2}[)]?)/.test(word)) break;
            if (NAME_STOP_WORDS.has(word)) break;

            nameWords.unshift(tokens[j].w);
        }

        let name = nameWords.join(' ').replace(/[^\wÀ-ÿ\s'\-]/gu, ' ').replace(/\s{2,}/g, ' ').trim();
        if (name.length < 4 || name.split(' ').length < 2) continue;

        const searchZone = text.slice(tokens[i].pos, tokens[i].pos + 400);
        const timeM  = searchZone.match(RE_TIME_SIMPLE);
        const time   = timeM ? timeM[1] : '00:00';

        const service = firstService(searchZone);

        // Bare 11-digit CPF after keyword "CPF". In OCR space this might have spaces
        let cpf = 'NÃO INFORMADO';
        const cpfRaw = searchZone.match(/CPF[\s:]+([\d\.\-\s]{11,15})/i);
        if (cpfRaw) cpf = formatCPF(cpfRaw[1]);

        equipe.push({ nome: name.toUpperCase(), cpf, horario: time, servico: service });
    }
    return equipe;
}

const txt = `
Canal: Intranet
CAMILA RIBEIRO MARTINS - Data de
Nascimento:
05/02/1989
07:50 Cumprimento de Exigência
CPF
1764057120
NIT
16207597126
`;
console.log(JSON.stringify(parseAgendaSucinta2(txt), null, 2));
