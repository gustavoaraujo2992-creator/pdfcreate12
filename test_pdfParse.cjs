const fs = require('fs');
const pdfParse = require('pdf-parse').PDFParse;

const buffer = fs.readFileSync('c:/Users/leonardo.pedrosa/Documents/agendamentos-2026-03-27T10_20_17.868943437Z.pdf');
pdfParse(buffer).then(data => {
    console.log("SUCCESS length:", data.text.length);
}).catch(e => console.error("ERR:", e));
