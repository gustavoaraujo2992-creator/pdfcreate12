import { parseINSSText } from './parser.mjs';

const txtSucinta = `
Agenda Sucinta
CELIA HOLANDA CAVALCANTE - Data de Nascimento: 04/08/1974
07:30 Cumprimento de Exigência CPF 66638020110 23/03/2026 18:52 1383429179
FABIANA BATISTA MACHADO LOPES - Data de Nascimento: 20/06/1980
07:30 Atendimento Simplificado       CPF 70627630120      03/03/2026  761538646
14:24
`;

const txtSimples = `
27/03/2026 07:30 372.***.***-15 JOSE ALVES DE SOUSA
27/03/2026 07:40 059.***.***-73 Isac Miguel de Oliveira Neto
`;

const txtDetran = `
NA HORA CEILANDIA Veículo e/ou Habilitação WALDIR OLIVEIRA DOS SANTOS 036.282.061-97 27/03/2026 07:30:00 07:45:00
NA HORA CEILANDIA Veículo e/ou Habilitação RAFAEL PIRES SOUSA 029.894.471-56 27/03/2026 08:00:00 08:15:00
`;

const txtSEAP = `
VISITANTE CAROLYN RIBEIRO MUNIZ       27/03/2026  07:30 - 08:00
VISITANTE JOAO CLEMARK DOS SANTOS (61) 98888-9999 27/03/2026 08:00 - 08:30
VISITANTE SARA KELLI ALENCAR DO 12/03/2026 27/03/2026  08:00 - 08:30 Não Informado
`;

console.log("=== SUCINTA ===");
console.log(parseINSSText(txtSucinta).equipe);
console.log("\n=== SIMPLES ===");
console.log(parseINSSText(txtSimples).equipe);
console.log("\n=== DETRAN ===");
console.log(parseINSSText(txtDetran).equipe);
console.log("\n=== SEAP ===");
console.log(parseINSSText(txtSEAP).equipe);
