const fs = require('fs');

function parseText(rawText) {
    const lines = rawText.split('\n');
    const equipe = [];
    let setor = 'AGENDAMENTOS GERAL';
    let dataRef = '';

    // If first line has date, extract it
    const dateHeaderMatch = lines[0] && lines[0].match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dateHeaderMatch) {
       dataRef = dateHeaderMatch[1];
    }
    
    for (let i = 0; i < lines.length; i++) {
        let trimmed = lines[i].trim();
        if (!trimmed) continue;
        
        // Match the new format: "27/03/2026 07:30 372.***.***-15 JOSE ALVES DE"
        const novoFormatoMatch = trimmed.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(\d{3}\.[*\d]{3}\.[*\d]{3}-\d{2})\s+(.+)$/);
        
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
                cpf: cpf,
                horario: hora,
                status: 'Agendado',
                setor: setor,
                servico: currentLineServico
            });
            continue;
        }

        // ORIGINAL LOGIC FALLBACKS (abbreviated for testing)
        // ... (we'll keep the old regexes in the actual server.mjs)
    }

    return { dataRef, equipe };
}

const text = fs.readFileSync('c:\\Users\\leonardo.pedrosa\\Documents\\projetos\\pdfnice\\output_pdf_new_py.txt', 'utf8');
const result = parseText(text);
console.log(`Found ${result.equipe.length} records. First 5:`, result.equipe.slice(0, 5));
