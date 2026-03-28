import { parseINSSText } from './parser.mjs';

const text = "Veículo e/ou Habilitação   WALDIR OLIVEIRA DOS SANTOS   036.282.061-97 27/03/202607:30:00 07:45:00 202603/045592 Pendente";

const res = parseINSSText(text);
console.log(JSON.stringify(res, null, 2));
