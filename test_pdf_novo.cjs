const fs = require('fs');
const pdfParse = require('pdf-parse');

const filePath = 'C:\\Users\\leonardo.pedrosa\\Documents\\agendamentos-2026-03-27T10_20_17.868943437Z.pdf';
const dataBuffer = fs.readFileSync(filePath);

pdfParse(dataBuffer).then(function(data) {
    console.log('Pages:', data.numpages);
    console.log('\n=== EXTRACTED TEXT ===');
    console.log(data.text);
}).catch(e => console.error('Error:', e.message));
