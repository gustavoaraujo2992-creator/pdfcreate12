import fs from 'fs';
import path from 'path';

const file = fs.readFileSync('c:/Users/leonardo.pedrosa/Documents/agendamentos-2026-03-27T10_20_17.868943437Z.pdf');
const formData = new FormData();
formData.append('pdf', new Blob([file]), 'agendamentos.pdf');

fetch('http://localhost:3001/api/extract', {
    method: 'POST',
    body: formData
}).then(res => res.json())
  .then(data => {
      console.log('Success:', data.success);
      if (data.success) {
         console.log('Records Found:', data.parsed.equipe.length);
      } else {
         console.log('Error:', data.error);
      }
      process.exit(0);
  })
  .catch(err => {
      console.error('Fetch caught error:', err);
      process.exit(1);
  });
