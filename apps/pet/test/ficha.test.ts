// Uso: node --experimental-strip-types apps/pet/test/ficha.test.ts
import assert from 'node:assert';
import { codigoDaUrl, etiquetas, linkWhatsApp, textoAchei, lerResposta } from '../src/lib/ficha.ts';

assert.strictEqual(codigoDaUrl('/K7M3QX'), 'K7M3QX');
assert.strictEqual(codigoDaUrl('/k7m-3qx/'), 'K7M3QX');
assert.strictEqual(codigoDaUrl('/K7MOQL'), 'K7M0Q1');   // O→0 e L→1
assert.strictEqual(codigoDaUrl('/', '?c=a7h2p2'), 'A7H2P2');
assert.strictEqual(codigoDaUrl('/'), null);
assert.strictEqual(codigoDaUrl('/qualquer-coisa'), 'INVALIDO');
assert.strictEqual(codigoDaUrl('/UUUUUU'), 'INVALIDO');

assert.deepStrictEqual(etiquetas({ especie: 'cao', raca: 'Shih-tzu', porte: 'P' }), ['Cão', 'Shih-tzu', 'Porte pequeno']);
assert.deepStrictEqual(etiquetas({ especie: 'gato' }), ['Gato']);

const link = linkWhatsApp('5519900000303', textoAchei('K7M3QX', '  Está na praça  '));
assert.ok(link.startsWith('https://wa.me/5519900000303?text=ACHEI%20K7M3QX%0ARecado%3A%20Est'));

assert.deepStrictEqual(lerResposta(null), { estado: 'indisponivel' });
assert.deepStrictEqual(lerResposta({ estado: 'hackeado' }), { estado: 'indisponivel' });
assert.strictEqual(lerResposta({ estado: 'basica', pet: { nome: 'Thor' } }).pet?.nome, 'Thor');

console.log('ficha.ts: OK');
