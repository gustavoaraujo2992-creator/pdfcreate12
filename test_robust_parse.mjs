import fs from 'fs';

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

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line || line.startsWith('---') || line.length < 10) continue;

        const cpfPattern = /(\d{3}[.\s*]*\d{3}[.\s*]*\d{3}[-.\s*]*\d{2})/g;
        const timePattern = /(\d{1,2}:\d{2})/;
        const cpfMatch = line.match(cpfPattern);
        
        if (cpfMatch) {
            const cpf = cpfMatch[0];
            const timeMatch = line.match(timePattern);
            const time = timeMatch ? timeMatch[0] : '00:00';
            
            let content = line.replace(cpf, ' [CPF] ').replace(time, ' [TIME] ');
            let parts = content.split(/\[CPF\]|\[TIME\]/);
            let name = 'NÃO IDENTIFICADO';
            let service = 'GERAL';
            
            let cleanParts = parts.map(p => p.replace(/[:\-]/g, ' ').trim()).filter(p => p.length > 2);
            
            if (cleanParts.length > 0) {
                const capsWords = cleanParts.filter(p => /([A-ZÀ-Ü]{3,}\s+[A-ZÀ-Ü]{2,})/.test(p));
                if (capsWords.length > 0) {
                    name = capsWords[0].toUpperCase();
                    if (cleanParts.length > 1) {
                        service = cleanParts.find(p => p !== capsWords[0]) || 'GERAL';
                    }
                } else {
                    name = cleanParts[0].toUpperCase();
                    if (cleanParts.length > 1) service = cleanParts[1];
                }
            }

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
    }
    return equipe;
}

const testText = `
CELIA HOLANDA CAVALCANTE - Data de Nascimento: 07:30 Cumprimento de Exigência CPF 666.380.201-10 23/03/2026
FABIANA BATISTA MACHADO LOPES - Data de 07:30 Atendimento Simplificado CPF 706.276.301-20 03/03/2026
PYETRO ANDRADE CIPRIANO AMARAL - Data de 08:00 Carta de Concessão do Benefício CPF 116.654.201-70 23/03/2026
27/03/2026 10:15 123.***.***-45 JOÃO DA SILVA SAURO
`;

console.log(JSON.stringify(parseINSSText(testText), null, 2));
