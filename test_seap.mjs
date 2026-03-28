import { parseINSSText } from './parser.mjs';

const text = `PREVISÃO DE ATENDIMENTO
VISITANTE CAROLYN RIBEIRO MUNIZ (61) 9999-9999 27/03/2026 07:30 - 08:00
VISITANTE JOAO CLEMARK DOS SANTOS 6199999999 27/03/2026 08:00 - 08:30
`;

console.log(JSON.stringify(parseINSSText(text).equipe, null, 2));
