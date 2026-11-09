// =====================================================================
// PetCare Hub · Adaptador de entrada da Evolution API (v2, Baileys)
// Converte o webhook da Evolution no "evento" que o motor já entende,
// o mesmo formato que o Z-API e o canal de teste entregavam:
//   { canal, tipo, motivo, instance_id, telefone, texto, message_id, from_api }
//   tipo: 'texto' | 'midia' | 'fromme' | 'ignorar' | 'conexao'
// Para 'conexao': { canal, tipo, instance_id, conectado, detalhe }
//   conectado: true (open), false (close) ou null (connecting: ignorar).
//
// Este arquivo é a fonte. O build copia o conteúdo para o nó
// "Normalizar evento". Testes: node n8n/test/adaptador-evolution.test.js
// =====================================================================

const EVO_IGNORAR_TIPOS = [
  'protocolMessage', 'reactionMessage', 'editedMessage', 'pollUpdateMessage',
  'senderKeyDistributionMessage', 'messageContextInfo', 'ephemeralMessage',
];
const EVO_MIDIA_TIPOS = [
  'imageMessage', 'audioMessage', 'videoMessage', 'documentMessage', 'documentWithCaptionMessage',
  'stickerMessage', 'locationMessage', 'liveLocationMessage', 'contactMessage', 'contactsArrayMessage',
  'ptvMessage', 'viewOnceMessage', 'viewOnceMessageV2',
];

// "5519999990000@s.whatsapp.net" ou "5519999990000:12@s.whatsapp.net" → "+5519999990000"
function evoTelefone(jid) {
  const s = String(jid || '');
  if (!s.endsWith('@s.whatsapp.net') && !s.endsWith('@c.us')) return null;
  const digitos = s.split('@')[0].split(':')[0].replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 15 ? '+' + digitos : null;
}

function normalizarEvolution(corpo) {
  const b = (corpo && corpo.body) || corpo || {};
  const evento = String(b.event || '').toLowerCase().replace(/_/g, '.');
  const instancia = b.instance || null;
  const base = { canal: 'evolution', instance_id: instancia };
  const ignorar = (motivo) => ({ ...base, tipo: 'ignorar', motivo, telefone: null, texto: null, message_id: null, from_api: null });

  if (!instancia) return ignorar('webhook sem instância');

  // ---------------------------------------------------------- conexão
  if (evento === 'connection.update') {
    const d = b.data || {};
    const estado = String(d.state || '');
    const conectado = estado === 'open' ? true : estado === 'close' ? false : null;
    const motivo = d.statusReason !== undefined && d.statusReason !== null ? Number(d.statusReason) : null;
    const detalhe = 'webhook ' + (estado || '?')
      + (motivo ? ' (' + motivo + (motivo === 401 ? ': aparelho removido no celular, precisa de nova conexão' : '') + ')' : '');
    return { ...base, tipo: 'conexao', conectado, detalhe };
  }

  if (evento !== 'messages.upsert') return ignorar('evento ' + (evento || 'vazio'));

  // ---------------------------------------------------------- mensagem
  const d = Array.isArray(b.data) ? b.data[0] : b.data;
  if (!d || !d.key) return ignorar('mensagem sem key');
  const k = d.key;
  const jid = String(k.remoteJid || '');

  if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter') || jid === 'status@broadcast') {
    return ignorar('grupo, canal ou status');
  }

  // LID: o WhatsApp pode mandar um id interno no lugar do telefone.
  // O telefone vem num campo alternativo (nome conforme a versão).
  let telefone = evoTelefone(jid);
  if (!telefone) {
    telefone = evoTelefone(k.remoteJidAlt) || evoTelefone(k.senderPn) || evoTelefone(d.senderPn)
      || evoTelefone(k.participantAlt) || null;
  }
  if (!telefone) return { ...ignorar('LID sem telefone: ' + jid), message_id: k.id || null };

  const m = d.message || {};
  const tipoMsg = String(d.messageType || Object.keys(m)[0] || '');
  if (EVO_IGNORAR_TIPOS.includes(tipoMsg)) return ignorar('tipo ' + tipoMsg);

  const texto = (typeof m.conversation === 'string' ? m.conversation : null)
    ?? (m.extendedTextMessage && m.extendedTextMessage.text)
    ?? (m.buttonsResponseMessage && m.buttonsResponseMessage.selectedDisplayText)
    ?? (m.listResponseMessage && m.listResponseMessage.title)
    ?? null;

  const comum = { ...base, telefone, message_id: k.id || null, from_api: null, motivo: '' };

  if (k.fromMe === true) return { ...comum, tipo: 'fromme', texto: null };
  if (typeof texto === 'string' && texto.trim()) return { ...comum, tipo: 'texto', texto };
  if (EVO_MIDIA_TIPOS.includes(tipoMsg)) return { ...comum, tipo: 'midia', texto: null, motivo: tipoMsg };
  return ignorar('sem texto (' + (tipoMsg || 'tipo vazio') + ')');
}

// Exporta para testes em Node; no N8n o build acrescenta a chamada ao final.
if (typeof module !== 'undefined') module.exports = { normalizarEvolution, evoTelefone };
