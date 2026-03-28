import assert from 'assert';
import { parseINSSText } from './parser.mjs';

function runTest(name, testFunction) {
  try {
    testFunction();
    console.log(`✅ [PASS] ${name}`);
  } catch (error) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(error);
    process.exit(1);
  }
}

runTest('should parse INSS Simples format correctly', () => {
  const text = `
    25/03/2026 08:00 123.***.***-45 NOME COMPLETO UM
    SERVIÇO DE ATENDIMENTO
    26/03/2026 09:30 456.***.***-78 NOME COMPLETO DOIS
  `;
  const result = parseINSSText(text);
  assert.strictEqual(result.formato, 'INSS Simples');
  assert.strictEqual(result.equipe.length, 2);
  assert.strictEqual(result.equipe[0].nome, 'NOME COMPLETO UM');
  assert.strictEqual(result.equipe[0].cpf, '123.***.***-45');
  assert.strictEqual(result.equipe[0].horario, '08:00');
  assert.strictEqual(result.equipe[0].data, '25/03/2026');
  assert.strictEqual(result.equipe[1].nome, 'NOME COMPLETO DOIS');
  assert.strictEqual(result.equipe[1].cpf, '456.***.***-78');
  assert.strictEqual(result.equipe[1].horario, '09:30');
  assert.strictEqual(result.equipe[1].data, '26/03/2026');
});

runTest('should parse Agenda Sucinta format correctly', () => {
  const text = `
    NOME COMPLETO TRÊS - Data de Nascimento: 01/01/1990
    09:00 Atendimento Simplificado CPF 11122233344
  `;
  const result = parseINSSText(text);
  assert.strictEqual(result.formato, 'INSS Agenda Sucinta');
  assert.strictEqual(result.equipe.length, 1);
  assert.strictEqual(result.equipe[0].nome, 'NOME COMPLETO TRÊS');
  assert.strictEqual(result.equipe[0].cpf, '111.222.333-44');
  assert.strictEqual(result.equipe[0].horario, '09:00');
});

runTest('should parse SEAP Visitante format correctly', () => {
  const text = `
    VISITANTE NOME COMPLETO QUATRO 28/03/2026 10:00 - 11:00
    PREVISÃO DE ATENDIMENTO
  `;
  const result = parseINSSText(text);
  assert.strictEqual(result.formato, 'SEAP Visitante');
  assert.strictEqual(result.equipe.length, 1);
  assert.strictEqual(result.equipe[0].nome, 'NOME COMPLETO QUATRO');
  assert.strictEqual(result.equipe[0].cpf, 'NÃO INFORMADO');
  assert.strictEqual(result.equipe[0].horario, '10:00');
});

runTest('should parse Detran / CPF Completo format correctly', () => {
  const text = `
    UNIDADE SERVICO NOME COMPLETO CINCO 123.456.789-10 28/03/2026 14:00
  `;
  const result = parseINSSText(text);
  assert.strictEqual(result.formato, 'Detran / CPF Completo');
  assert.strictEqual(result.equipe.length, 1);
  assert.strictEqual(result.equipe[0].nome, 'NOME COMPLETO CINCO');
  assert.strictEqual(result.equipe[0].cpf, '123.456.789-10');
  assert.strictEqual(result.equipe[0].horario, '14:00');
});

runTest('should handle unrecognized format', () => {
  const text = 'This is some random text that should not be parsed.';
  const result = parseINSSText(text);
  assert.strictEqual(result.formato, 'Formato não reconhecido');
  assert.strictEqual(result.equipe.length, 0);
});
