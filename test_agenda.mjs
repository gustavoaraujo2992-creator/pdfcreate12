import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const buffer = fs.readFileSync('C:\\Users\\leonardo.pedrosa\\Documents\\Agenda INSS 27-03-2026.pdf');
pdfParse(buffer).then(data => {
    console.log('Chars:', data.text.length);
    fs.writeFileSync('agenda_native.txt', data.text);
}).catch(console.error);
