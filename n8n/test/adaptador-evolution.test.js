// Testes do adaptador da Evolution. Uso: node n8n/test/adaptador-evolution.test.js
// Os payloads seguem o formato do webhook da Evolution v2. Depois do teste E3
// (primeira conversa real), troque-os pelos JSON capturados do seu webhook.
const assert = require('node:assert/strict');
const { normalizarEvolution, evoTelefone } = require('../src/adaptador-evolution.js');

const msg = (key, message, extra = {}) => ({
  body: { event: 'messages.upsert', instance: 'pet-feliz',
    data: { key: { id: '3EB0A1', fromMe: false, ...key }, pushName: 'Elisa', message, messageType: Object.keys(message || {})[0], messageTimestamp: 1794240000, ...extra } },
});

const casos = [
  ['texto simples', msg({ remoteJid: '5519999990000@s.whatsapp.net' }, { conversation: 'oi' }),
    { canal: 'evolution', tipo: 'texto', instance_id: 'pet-feliz', telefone: '+5519999990000', texto: 'oi', message_id: '3EB0A1' }],
  ['texto estendido', msg({ remoteJid: '5519999990000@s.whatsapp.net' }, { extendedTextMessage: { text: '1' } }),
    { tipo: 'texto', texto: '1' }],
  ['eco ou dono (fromMe)', msg({ remoteJid: '5519999990000@s.whatsapp.net', fromMe: true }, { conversation: 'já te respondo' }),
    { tipo: 'fromme', telefone: '+5519999990000', texto: null, message_id: '3EB0A1' }],
  ['áudio', msg({ remoteJid: '5519999990000@s.whatsapp.net' }, { audioMessage: { seconds: 4 } }),
    { tipo: 'midia', texto: null, motivo: 'audioMessage' }],
  ['grupo', msg({ remoteJid: '120363000000000000@g.us' }, { conversation: 'oi' }),
    { tipo: 'ignorar', motivo: 'grupo, canal ou status' }],
  ['status', msg({ remoteJid: 'status@broadcast' }, { conversation: 'x' }),
    { tipo: 'ignorar' }],
  ['reação', msg({ remoteJid: '5519999990000@s.whatsapp.net' }, { reactionMessage: { text: '👍' } }),
    { tipo: 'ignorar', motivo: 'tipo reactionMessage' }],
  ['LID com telefone alternativo', msg({ remoteJid: '123456789012345@lid', remoteJidAlt: '5519988887777@s.whatsapp.net' }, { conversation: 'oi' }),
    { tipo: 'texto', telefone: '+5519988887777' }],
  ['LID com senderPn', msg({ remoteJid: '123456789012345@lid' }, { conversation: 'oi' }, { senderPn: '5519988887777@s.whatsapp.net' }),
    { tipo: 'texto', telefone: '+5519988887777' }],
  ['LID sem telefone', msg({ remoteJid: '123456789012345@lid' }, { conversation: 'oi' }),
    { tipo: 'ignorar', telefone: null, message_id: '3EB0A1' }],
  ['jid com dispositivo', msg({ remoteJid: '5519999990000:12@s.whatsapp.net' }, { conversation: 'oi' }),
    { telefone: '+5519999990000' }],
  ['conexão aberta', { body: { event: 'connection.update', instance: 'pet-feliz', data: { state: 'open', statusReason: 200 } } },
    { tipo: 'conexao', conectado: true, instance_id: 'pet-feliz' }],
  ['conexão caiu (401)', { body: { event: 'connection.update', instance: 'pet-feliz', data: { state: 'close', statusReason: 401 } } },
    { tipo: 'conexao', conectado: false }],
  ['conectando', { body: { event: 'CONNECTION_UPDATE', instance: 'pet-feliz', data: { state: 'connecting' } } },
    { tipo: 'conexao', conectado: null }],
  ['outro evento', { body: { event: 'qrcode.updated', instance: 'pet-feliz', data: {} } },
    { tipo: 'ignorar', motivo: 'evento qrcode.updated' }],
  ['sem instância', { body: { event: 'messages.upsert', data: {} } },
    { tipo: 'ignorar', motivo: 'webhook sem instância' }],
  ['corpo sem envelope', { event: 'messages.upsert', instance: 'pet-feliz', data: { key: { remoteJid: '5519999990000@s.whatsapp.net', id: 'X' }, message: { conversation: 'menu' } } },
    { tipo: 'texto', texto: 'menu', message_id: 'X' }],
];

let falhas = 0;
for (const [nome, entrada, esperado] of casos) {
  const r = normalizarEvolution(entrada);
  try {
    for (const [k, v] of Object.entries(esperado)) assert.deepEqual(r[k], v, `${k}`);
    console.log('ok  ', nome);
  } catch (e) {
    falhas++;
    console.log('FALHA', nome, '→', e.message, '\n      obtido:', JSON.stringify(r));
  }
}
assert.equal(evoTelefone('5519@s.whatsapp.net'), null, 'telefone curto não vale');
assert.equal(evoTelefone('abc@lid'), null);
console.log(falhas ? `\n${falhas} falha(s)` : `\n${casos.length} casos OK`);
process.exit(falhas ? 1 : 0);
