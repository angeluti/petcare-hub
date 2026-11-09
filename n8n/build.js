// =====================================================================
// Gera os workflows do N8n (n8n/workflows/*.json) a partir do código-fonte.
// Uso: node n8n/build.js
// O motor de conversa vive em n8n/src/motor-conversa.js e é testado com
// n8n/test/simular.js. Este script copia o código para o nó "Motor (passo)".
// Os JSON não levam credenciais: só o nome da credencial, que você cria no N8n.
// =====================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';   // troque no nó "Chamar RPC" depois de importar
// Evolution API no mesmo projeto Railway: rede privada. Se a chamada interna falhar,
// troque pelo domínio público da Evolution (https://...) e rode o build de novo.
const EVO_URL = 'http://evolution-api.railway.internal:8080';
const CRED_SUPABASE = { httpHeaderAuth: { id: 'TROCAR', name: 'supabase n8n-bot' } };
const CRED_EVO = { httpHeaderAuth: { id: 'TROCAR', name: 'evolution global' } };          // header apikey = chave global
const CRED_EVO_WEBHOOK = { httpHeaderAuth: { id: 'TROCAR', name: 'evolution webhook' } }; // header x-petcare-secret
const ESPERA_LEMBRETE_S = 25;   // intervalo entre lembretes (reduz risco de bloqueio do número)
const CRED_CHAT = { httpBasicAuth: { id: 'TROCAR', name: 'chat de teste' } };
const CRED_RESEND = { httpHeaderAuth: { id: 'TROCAR', name: 'resend n8n-alertas' } };
const EMAIL_ALERTAS = 'suporte@petcarehub.com.br';
const REMETENTE = 'PetCare Hub · Alertas <noreply@petcarehub.com.br>';

// Ids determinísticos: reimportar um workflow não muda a URL do chat nem dos webhooks.
let _wf = 'base', _seq = 0;
const id = () => {
  const h = crypto.createHash('sha1').update(`${_wf}:${_seq++}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const novoWf = (nome) => { _wf = nome; _seq = 0; };
const semExport = (arq) => fs.readFileSync(path.join(__dirname, 'src', arq), 'utf8')
  .replace(/\nif \(typeof module[^\n]*\n?/, '\n');
const motor = semExport('motor-conversa.js');
const adaptadorEvolution = semExport('adaptador-evolution.js');

// ------------------------------------------------------------ fábrica de nós
function code(name, pos, js) {
  return { parameters: { jsCode: js.trim() + '\n' }, id: id(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos };
}
function iff(name, pos, left, op, right, tipo = 'string') {
  const operator = tipo === 'boolean' ? { type: 'boolean', operation: op, singleValue: true } : { type: tipo, operation: op };
  const cond = { id: id(), leftValue: left, operator };
  if (tipo !== 'boolean') cond.rightValue = right;
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [cond], combinator: 'and',
      },
      looseTypeValidation: true, options: {},
    },
    id: id(), name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos,
  };
}
function http(name, pos, { method = 'POST', url, cred, body, timeout = 15000, texto = false }) {
  const resposta = { fullResponse: true, neverError: true };
  if (texto) resposta.responseFormat = 'text';   // Supabase devolve valor solto ou corpo vazio
  const p = {
    method, url, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    options: { response: { response: resposta }, timeout },
  };
  if (body) { p.sendBody = true; p.specifyBody = 'json'; p.jsonBody = body; }
  return { parameters: p, id: id(), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, credentials: cred, onError: 'continueRegularOutput' };
}
function rpcNode(name, pos) {
  return {
    parameters: {
      workflowId: { __rl: true, value: '', mode: 'list', cachedResultName: 'PetCare · RPC Supabase' },
      options: { waitForSubWorkflow: true },
    },
    id: id(), name, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: pos,
  };
}
function webhook(name, pos, p, cred) {
  const n = {
    parameters: { httpMethod: 'POST', path: p, responseMode: 'onReceived', options: {} },
    id: id(), name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos, webhookId: id(),
  };
  // Header Auth: o N8n responde 403 sem chamar nada se o cabeçalho não bater.
  if (cred) { n.parameters.authentication = 'headerAuth'; n.credentials = cred; }
  return n;
}
function espera(name, pos, segundos) {
  return { parameters: { amount: segundos, unit: 'seconds' }, id: id(), name, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: pos, webhookId: id() };
}
function lacoUmPorVez(name, pos) {
  // Loop Over Items: saída 0 = terminou, saída 1 = próximo item.
  return { parameters: { batchSize: 1, options: {} }, id: id(), name, type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: pos };
}
function cron(name, pos, expr) {
  return {
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: expr }] } },
    id: id(), name, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos,
  };
}
function nota(texto, pos, w = 420, h = 220) {
  return { parameters: { content: texto, height: h, width: w }, id: id(), name: 'Nota ' + id().slice(0, 4), type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos };
}
function liga(conns, de, para, saida = 0) {
  conns[de] = conns[de] || { main: [] };
  while (conns[de].main.length <= saida) conns[de].main.push([]);
  conns[de].main[saida].push({ node: para, type: 'main', index: 0 });
}
function workflow(name, nodes, conns, extra = {}) {
  return {
    name, nodes, connections: conns, active: false, pinData: {},
    settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner', ...extra },
    meta: { templateCredsSetupCompleted: false }, tags: [],
  };
}
const RESEND_BODY = `={{ JSON.stringify({ from: '${REMETENTE}', to: ['${EMAIL_ALERTAS}'], subject: $json.email.assunto, text: $json.email.texto }) }}`;
// Evolution v2: POST /message/sendText/{instancia} { number, text, delay } → 201 { key: { id } }.
// delay: mostra "digitando…" por 1,2 s antes de enviar.
const EVO_ENVIO_URL = `=${EVO_URL}/message/sendText/{{ $json.envio.instancia }}`;
const EVO_ENVIO_BODY = '={{ JSON.stringify({ number: $json.envio.phone, text: $json.envio.texto, delay: 1200 }) }}';
const evoEnvio = (name, pos) => http(name, pos, { url: EVO_ENVIO_URL, cred: CRED_EVO, body: EVO_ENVIO_BODY, timeout: 20000 });
const PREPARAR_LOG = `
// Depois do envio: registra em mensagens_log (CM-11) com o id da Evolution (key.id).
// O id é o que faz o fromMe do próprio bot ser reconhecido e ignorado.
const envios = $('ORIGEM').all();
return $input.all().map((r, i) => {
  const e = envios[i].json.envio;
  const j = r.json || {};
  const ok = j.statusCode >= 200 && j.statusCode < 300;
  const b = ok && j.body && typeof j.body === 'object' ? j.body : {};
  const idExterno = (b.key && b.key.id) || b.messageId || b.id || null;
  return { json: {
    envio: { ...e, token: undefined },
    falhou: !ok,
    resultados: {},
    proximo: { chave: 'log', fn: 'bot_registrar_mensagem', args: {
      p_petshop: e.petshop_id, p_telefone: e.para, p_direcao: 'saida', p_tipo: e.tipo,
      p_status: ok ? 'enviada' : 'falha', p_agendamento: e.agendamento_id || null,
      p_id_externo: idExterno, p_erro: ok ? null : JSON.stringify(j.body || j.error || j).slice(0, 500) } },
  } };
});`;

// E-mail de queda e volta da conexão (usado no 01, pelo webhook, e no 03, pelo cron).
const MONTAR_EMAIL_CONEXAO = `
return $input.all().map((it) => {
  const e = it.json.resultados.evento.body;
  const queda = e.alertar_queda;
  return { json: { email: {
    assunto: queda ? \`⚠️ WhatsApp desconectado: \${e.petshop}\` : \`✅ WhatsApp reconectado: \${e.petshop}\`,
    texto: queda
      ? \`O WhatsApp do pet shop \${e.petshop} está desconectado da Evolution API.\\nBot ligado: \${e.bot_ativo ? 'sim' : 'não'}.\\nDetalhe: \${e.detalhe || '-'}\\n\\nO que fazer: abrir o manager da Evolution (/manager), entrar na instância e conectar de novo (QR ou código de pareamento) com o celular do pet shop. Se o detalhe cita 401, o aparelho foi removido no celular.\\nEnquanto isso, o bot não responde e os lembretes não saem.\\nEste alerta se repete a cada 6 horas enquanto a conexão não voltar.\`
      : \`O WhatsApp do pet shop \${e.petshop} voltou a se conectar. Nada a fazer.\`,
  } } };
});`;
const ALERTAR_CONEXAO = '={{ !!($json.resultados.evento.body && ($json.resultados.evento.body.alertar_queda || $json.resultados.evento.body.alertar_volta)) }}';

const saida = path.join(__dirname, 'workflows');
fs.mkdirSync(saida, { recursive: true });
const grava = (arq, wf) => fs.writeFileSync(path.join(saida, arq), JSON.stringify(wf, null, 2) + '\n');

// =========================================================== 0. RPC Supabase
{
  novoWf('0.');
  const n = [
    { parameters: { inputSource: 'passthrough' }, id: id(), name: 'Ao ser chamado', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: [0, 0] },
    http('Chamar RPC', [240, 0], {
      url: `=${SUPABASE_URL}/rest/v1/rpc/{{ $json.proximo.fn }}`, cred: CRED_SUPABASE,
      body: '={{ JSON.stringify($json.proximo.args || {}) }}', texto: true,
    }),
    code('Guardar resultado', [480, 0], `
// Junta a resposta da RPC ao contexto que chegou, em resultados[chave].
// O nó HTTP recebe a resposta como texto: o Supabase devolve valor solto
// ("uuid", true) ou corpo vazio (função void), que o modo JSON do N8n recusa.
// Conflito de horário chega como HTTP 400 com body.code = "23P01":
// quem decide é quem chamou, sempre pelo code.
const entradas = $('Ao ser chamado').all();
const ler = (t) => {
  if (t === undefined || t === null) return null;
  if (typeof t !== 'string') return t;
  if (t.trim() === '') return null;
  try { return JSON.parse(t); } catch (e) { return t; }
};
return $input.all().map((r, i) => {
  const ctx = entradas[i].json;
  const p = ctx.proximo || {};
  const j = r.json || {};
  const res = j.statusCode !== undefined
    ? { status: j.statusCode, body: ler(j.body !== undefined ? j.body : j.data) }
    : { status: 0, body: { code: 'REDE', message: String((j.error && j.error.message) || JSON.stringify(j)).slice(0, 300) } };
  const { proximo, ...resto } = ctx;
  return { json: { ...resto, resultados: { ...(ctx.resultados || {}), [p.chave || p.fn]: res }, passos: (ctx.passos || 0) + 1 } };
});`),
    nota('## RPC Supabase\nChama `POST /rest/v1/rpc/<fn>` com a secret key `n8n-bot` (header **apikey**, sem Bearer).\nEntrada: `proximo = { chave, fn, args }`. Saída: o mesmo item com `resultados[chave] = { status, body }`.\n\n**Troque `SEU-PROJETO` no nó Chamar RPC.** É o único lugar com o endereço do Supabase.', [-40, -300], 520, 240),
  ];
  const c = {};
  liga(c, 'Ao ser chamado', 'Chamar RPC');
  liga(c, 'Chamar RPC', 'Guardar resultado');
  grava('00-rpc-supabase.json', workflow('PetCare · RPC Supabase', n, c));
}

// =========================================================== 1. Bot conversa
{
  novoWf('1.');
  const n = [
    webhook('Evolution · Ao receber', [0, 0], 'petcare-hub/evolution', CRED_EVO_WEBHOOK),
    code('Normalizar evento', [220, 0], adaptadorEvolution + `
// ---- N8n: webhook da Evolution (messages.upsert e connection.update na mesma URL)
return [{ json: { evento: normalizarEvolution($json.body), resultados: {}, passos: 0, execucao_id: $execution.id } }];`),
    iff('Conexão?', [440, 0], '={{ $json.evento.tipo }}', 'equals', 'conexao'),
    code('Pedir registro de conexão', [660, -260], `
// connecting é transitório: não registra nem alerta.
const ev = $json.evento;
if (ev.conectado === null) return [];
return [{ json: { resultados: {}, proximo: { chave: 'evento', fn: 'bot_conexao_evento',
  args: { p_instance: ev.instance_id, p_conectado: ev.conectado, p_detalhe: ev.detalhe } } } }];`),
    rpcNode('RPC · registrar conexão', [880, -260]),
    iff('Alertar?', [1100, -260], ALERTAR_CONEXAO, 'true', null, 'boolean'),
    code('Montar e-mail', [1320, -320], MONTAR_EMAIL_CONEXAO),
    http('Resend · e-mail', [1540, -320], { url: 'https://api.resend.com/emails', cred: CRED_RESEND, body: RESEND_BODY }),
    iff('Ignorar?', [660, 0], '={{ $json.evento.tipo }}', 'equals', 'ignorar'),
    code('Telefone ausente?', [880, -120], `
// Só o caso LID sem telefone vira erro registrado (PL-04): o tutor ficou sem resposta.
// Grupos, status, reações etc. são descartados em silêncio.
const ev = $json.evento;
if (!String(ev.motivo || '').startsWith('LID')) return [];
return [{ json: { resultados: {}, proximo: { chave: 'erro', fn: 'bot_registrar_erro', args: {
  p_workflow: 'PetCare · Bot conversa', p_no: 'Normalizar evento',
  p_mensagem: 'Mensagem sem telefone (só LID) na instância ' + ev.instance_id + ': ' + ev.motivo,
  p_execucao: String($execution.id), p_url: null, p_petshop: null } } } }];`),
    rpcNode('RPC · registrar LID', [1100, -120]),
    iff('fromMe?', [880, 100], '={{ $json.evento.tipo }}', 'equals', 'fromme'),
    espera('Esperar 8 s', [1100, 0], 8),
    code('Motor (passo)', [1100, 200], motor + `
// ---- N8n: um passo do motor por vez (o laço passa pelo sub-workflow de RPC)
return [{ json: passo($input.first().json) }];`),
    iff('Precisa de RPC?', [1320, 200], '={{ $json.proximo.tipo }}', 'equals', 'rpc'),
    rpcNode('RPC Supabase', [1320, 420]),
    iff('Tem envios?', [1540, 100], '={{ (($json.proximo || {}).envios || []).length }}', 'gt', 0, 'number'),
    code('Separar envios', [1760, 0], `
// Uma mensagem por destinatário: tutor e, se houver, o celular de avisos do dono.
return $json.proximo.envios.map((e) => ({ json: { envio: e } }));`),
    evoEnvio('Evolution · enviar', [1980, 0]),
    code('Preparar log', [2200, 0], PREPARAR_LOG.replace('ORIGEM', 'Separar envios')),
    rpcNode('RPC · registrar envio', [2420, 0]),
    nota('## Bot conversa (Evolution API)\n1. Webhook com **Header Auth** (`x-petcare-secret`) recebe mensagens e conexão da Evolution.\n2. **Conexão** → `bot_conexao_evento` → e-mail se for queda ou volta.\n3. **fromMe** espera 8 s (dá tempo de o envio do bot gravar o id) e chama `bot_registrar_fromme`: eco do bot é ignorado; mensagem do dono pausa o bot (BT-18).\n4. **Motor (passo)** pede uma RPC por vez até terminar. Fontes: `n8n/src/motor-conversa.js` e `n8n/src/adaptador-evolution.js` (não edite aqui).\n5. Envia pela Evolution e registra em `mensagens_log`.', [0, -620], 640, 300),
  ];
  const c = {};
  liga(c, 'Evolution · Ao receber', 'Normalizar evento');
  liga(c, 'Normalizar evento', 'Conexão?');
  liga(c, 'Conexão?', 'Pedir registro de conexão', 0);
  liga(c, 'Pedir registro de conexão', 'RPC · registrar conexão');
  liga(c, 'RPC · registrar conexão', 'Alertar?');
  liga(c, 'Alertar?', 'Montar e-mail', 0);
  liga(c, 'Montar e-mail', 'Resend · e-mail');
  liga(c, 'Conexão?', 'Ignorar?', 1);
  liga(c, 'Ignorar?', 'Telefone ausente?', 0);
  liga(c, 'Telefone ausente?', 'RPC · registrar LID');
  liga(c, 'Ignorar?', 'fromMe?', 1);
  liga(c, 'fromMe?', 'Esperar 8 s', 0);
  liga(c, 'fromMe?', 'Motor (passo)', 1);
  liga(c, 'Esperar 8 s', 'Motor (passo)');
  liga(c, 'Motor (passo)', 'Precisa de RPC?');
  liga(c, 'Precisa de RPC?', 'RPC Supabase', 0);
  liga(c, 'Precisa de RPC?', 'Tem envios?', 1);
  liga(c, 'RPC Supabase', 'Motor (passo)');
  liga(c, 'Tem envios?', 'Separar envios', 0);
  liga(c, 'Separar envios', 'Evolution · enviar');
  liga(c, 'Evolution · enviar', 'Preparar log');
  liga(c, 'Preparar log', 'RPC · registrar envio');
  grava('01-bot-conversa.json', workflow('PetCare · Bot conversa', n, c));
}

// =========================================================== 2. Lembretes 24h
{
  novoWf('2.');
  const n = [
    cron('Todo dia às 10h', [0, 0], '0 10 * * *'),
    // A: lembretes
    code('Pedir pendentes', [220, -120], `
return [{ json: { resultados: {}, proximo: { chave: 'pend', fn: 'lembretes_pendentes', args: { p_petshop: null } } } }];`),
    rpcNode('RPC · pendentes', [440, -120]),
    code('Um item por lembrete', [660, -120], `
// lembretes_pendentes já filtra: confirmado, amanhã no fuso do pet shop, bot ligado,
// tutor que aceita mensagens, fora de período bloqueado e dentro do limite semanal (CM-10).
const r = $json.resultados.pend;
if (!r || r.status !== 200) throw new Error('lembretes_pendentes falhou: ' + JSON.stringify(r));
return (r.body || []).map((l) => ({ json: { lembrete: l, resultados: {},
  proximo: { chave: 'marcar', fn: 'bot_lembrete_marcar', args: { p_agendamento: l.agendamento_id } } } }));`),
    lacoUmPorVez('Um lembrete por vez', [880, -120]),
    rpcNode('RPC · marcar lembrete', [1100, -40]),
    iff('Marcado agora?', [1320, -40], '={{ $json.resultados.marcar.body === true }}', 'true', null, 'boolean'),
    code('Pedir dados de envio', [1320, -200], `
return $input.all().map((it) => ({ json: { ...it.json,
  proximo: { chave: 'envio', fn: 'bot_envio', args: { p_petshop: it.json.lembrete.petshop_id } } } }));`),
    rpcNode('RPC · dados de envio', [1540, -200]),
    code('Montar lembrete', [1760, -200], `
// CM-02: texto do lembrete com SIM / NÃO. A resposta é tratada pelo bot
// (bot_responder_lembrete) quando o tutor responder.
return $input.all().map((it) => {
  const l = it.json.lembrete;
  const env = (it.json.resultados.envio || {}).body || {};
  const nome = String(l.nome_tutor || '').split(' ')[0];
  const texto = \`Oi\${nome ? ', ' + nome : ''}! Aqui é \${l.nome_bot || 'a assistente'} 🐾\\n\`
    + \`Lembrete: amanhã (\${l.data}) às \${l.hora} tem \${l.servicos || 'atendimento'} para \${l.pet}.\\n\\n\`
    + 'Responda *SIM* para confirmar ou *NÃO* se não puder vir.\\n'
    + '_Para não receber lembretes, responda SAIR._';
  return { json: { envio: { petshop_id: l.petshop_id, para: l.telefone, phone: String(l.telefone).replace(/\\D/g, ''),
    texto, tipo: 'lembrete', agendamento_id: l.agendamento_id, instancia: env.instancia || env.zapi_instance_id } } };
});`),
    evoEnvio('Evolution · lembrete', [1980, -200]),
    code('Preparar log do lembrete', [2200, -200], PREPARAR_LOG.replace('ORIGEM', 'Montar lembrete')),
    rpcNode('RPC · registrar lembrete', [2420, -200]),
    iff('Envio falhou?', [2640, -200], '={{ $json.falhou }}', 'true', null, 'boolean'),
    code('Liberar para nova tentativa', [2860, -280], `
return $input.all().map((it) => ({ json: { resultados: {},
  proximo: { chave: 'desmarcar', fn: 'bot_lembrete_desmarcar', args: { p_agendamento: it.json.envio.agendamento_id } } } }));`),
    rpcNode('RPC · desmarcar', [3080, -280]),
    espera(`Esperar ${ESPERA_LEMBRETE_S} s`, [3300, -120], ESPERA_LEMBRETE_S),
    // B: agendamentos em período bloqueado → aviso ao dono
    code('Pedir conflitos', [220, 200], `
return [{ json: { resultados: {}, proximo: { chave: 'conf', fn: 'bot_agendamentos_em_bloqueio', args: { p_petshop: null } } } }];`),
    rpcNode('RPC · conflitos', [440, 200]),
    code('Um item por pet shop', [660, 200], `
const r = $json.resultados.conf;
if (!r || r.status !== 200) throw new Error('bot_agendamentos_em_bloqueio falhou: ' + JSON.stringify(r));
return (r.body || []).filter((x) => x.telefone_avisos).map((x) => ({ json: { conflito: x, resultados: {},
  proximo: { chave: 'envio', fn: 'bot_envio', args: { p_petshop: x.petshop_id } } } }));`),
    rpcNode('RPC · dados de envio (dono)', [880, 200]),
    code('Montar aviso ao dono', [1100, 200], `
// Decisão da etapa 5: agendamento em período bloqueado não recebe lembrete;
// o dono é avisado e resolve pelo painel (remarcar ou cancelar e falar com o tutor).
return $input.all().map((it) => {
  const x = it.json.conflito;
  const env = (it.json.resultados.envio || {}).body || {};
  const linhas = x.itens.map((a) => \`• \${a.hora} — \${a.pet} (\${a.tutor}, \${a.telefone})\`).join('\\n');
  const texto = \`⚠️ Agenda de amanhã (\${x.itens[0].data})\\n\${x.itens.length === 1 ? 'Este agendamento cai' : 'Estes agendamentos caem'} em período bloqueado (feriado ou folga) e não receberam lembrete:\\n\${linhas}\\n\\nRemarque ou cancele pelo painel e avise o tutor.\`;
  return { json: { envio: { petshop_id: x.petshop_id, para: x.telefone_avisos, phone: String(x.telefone_avisos).replace(/\\D/g, ''),
    texto, tipo: 'alerta_dono', agendamento_id: null, instancia: env.instancia || env.zapi_instance_id } } };
});`),
    evoEnvio('Evolution · aviso ao dono', [1320, 200]),
    code('Preparar log do aviso', [1540, 200], PREPARAR_LOG.replace('ORIGEM', 'Montar aviso ao dono')),
    rpcNode('RPC · registrar aviso', [1760, 200]),
    nota(`## Lembretes 24h (CM-02, CM-10, CM-11)\nÀs 10h (fuso do workflow: America/Sao_Paulo).\n**A:** um lembrete por vez, com ${ESPERA_LEMBRETE_S} s entre envios (ritmo humano, menos risco de bloqueio do número). Marca antes de enviar (cron duplicado não manda duas vezes); registra o id logo depois de cada envio (o eco não pausa o bot); se a Evolution falhar, desmarca para o próximo cron.\n**B:** agendamentos de amanhã em período bloqueado: sem lembrete, aviso ao celular do dono.`, [0, -520], 600, 260),
  ];
  const c = {};
  liga(c, 'Todo dia às 10h', 'Pedir pendentes');
  liga(c, 'Todo dia às 10h', 'Pedir conflitos');
  liga(c, 'Pedir pendentes', 'RPC · pendentes');
  liga(c, 'RPC · pendentes', 'Um item por lembrete');
  liga(c, 'Um item por lembrete', 'Um lembrete por vez');
  liga(c, 'Um lembrete por vez', 'RPC · marcar lembrete', 1);   // saída 1 = próximo item
  liga(c, 'RPC · marcar lembrete', 'Marcado agora?');
  liga(c, 'Marcado agora?', 'Pedir dados de envio', 0);
  liga(c, 'Marcado agora?', 'Um lembrete por vez', 1);           // já enviado antes: segue sem esperar
  liga(c, 'Pedir dados de envio', 'RPC · dados de envio');
  liga(c, 'RPC · dados de envio', 'Montar lembrete');
  liga(c, 'Montar lembrete', 'Evolution · lembrete');
  liga(c, 'Evolution · lembrete', 'Preparar log do lembrete');
  liga(c, 'Preparar log do lembrete', 'RPC · registrar lembrete');
  liga(c, 'RPC · registrar lembrete', 'Envio falhou?');
  liga(c, 'Envio falhou?', 'Liberar para nova tentativa', 0);
  liga(c, 'Envio falhou?', `Esperar ${ESPERA_LEMBRETE_S} s`, 1);
  liga(c, 'Liberar para nova tentativa', 'RPC · desmarcar');
  liga(c, 'RPC · desmarcar', `Esperar ${ESPERA_LEMBRETE_S} s`);
  liga(c, `Esperar ${ESPERA_LEMBRETE_S} s`, 'Um lembrete por vez');
  liga(c, 'Pedir conflitos', 'RPC · conflitos');
  liga(c, 'RPC · conflitos', 'Um item por pet shop');
  liga(c, 'Um item por pet shop', 'RPC · dados de envio (dono)');
  liga(c, 'RPC · dados de envio (dono)', 'Montar aviso ao dono');
  liga(c, 'Montar aviso ao dono', 'Evolution · aviso ao dono');
  liga(c, 'Evolution · aviso ao dono', 'Preparar log do aviso');
  liga(c, 'Preparar log do aviso', 'RPC · registrar aviso');
  grava('02-lembretes-24h.json', workflow('PetCare · Lembretes 24h', n, c));
}

// =========================================================== 3. Conexão WhatsApp (PL-03)
// O webhook connection.update da Evolution chega no 01 (mesma URL das mensagens).
// Aqui fica só a checagem periódica, que pega queda que o webhook não avisou.
{
  novoWf('3.');
  const n = [
    cron('A cada 15 min', [0, 0], '*/15 * * * *'),
    code('Pedir instâncias', [220, 0], `
return [{ json: { resultados: {}, proximo: { chave: 'inst', fn: 'bot_instancias_monitoradas', args: {} } } }];`),
    rpcNode('RPC · instâncias', [440, 0]),
    code('Um item por instância', [660, 0], `
const r = $json.resultados.inst;
if (!r || r.status !== 200) throw new Error('bot_instancias_monitoradas falhou: ' + JSON.stringify(r));
return (r.body || []).filter((x) => x.canal === 'evolution' && x.instancia).map((x) => ({ json: { inst: x } }));`),
    http('Evolution · estado', [880, 0], {
      method: 'GET', cred: CRED_EVO, timeout: 15000,
      url: `=${EVO_URL}/instance/connectionState/{{ $json.inst.instancia }}`,
    }),
    code('Interpretar estado', [1100, 0], `
// GET /instance/connectionState/{instancia} → { instance: { instanceName, state } }.
// open = conectado. close ou connecting há 15 min = caído. 404 = a instância não existe
// mais na Evolution (apagada ou banco perdido): conta como queda.
// Sem resposta da Evolution (rede, 5xx) não conta como queda: evita alarme falso,
// e o erro de rede aparece no 04 se repetir.
const insts = $('Um item por instância').all();
return $input.all().flatMap((r, i) => {
  const x = insts[i].json.inst;
  const j = r.json || {};
  let conectado = null, detalhe = null;
  if (j.statusCode === 404) { conectado = false; detalhe = 'instância não encontrada na Evolution'; }
  else if (j.statusCode >= 200 && j.statusCode < 300) {
    const b = j.body || {};
    const estado = (b.instance && b.instance.state) || b.state || '?';
    conectado = estado === 'open';
    detalhe = conectado ? null : 'cron: estado ' + estado;
  }
  if (conectado === null) return [];
  return [{ json: { resultados: {}, proximo: { chave: 'evento', fn: 'bot_conexao_evento',
    args: { p_instance: x.instancia, p_conectado: conectado, p_detalhe: detalhe } } } }];
});`),
    rpcNode('RPC · registrar conexão', [1320, 0]),
    iff('Alertar?', [1540, 0], ALERTAR_CONEXAO, 'true', null, 'boolean'),
    code('Montar e-mail', [1760, -60], MONTAR_EMAIL_CONEXAO),
    http('Resend · e-mail', [1980, -60], { url: 'https://api.resend.com/emails', cred: CRED_RESEND, body: RESEND_BODY }),
    nota('## Conexão do WhatsApp (PL-03)\nA cada 15 min consulta `connectionState` de cada instância com a chave global (`evolution global`).\nO webhook `connection.update` é tratado no **01 · Bot conversa**.\n`bot_conexao_evento` decide se alerta: na queda, de novo a cada 6 h se continuar caído, e na volta.\nE-mail via Resend para suporte@.', [0, -300], 560, 240),
  ];
  const c = {};
  liga(c, 'A cada 15 min', 'Pedir instâncias');
  liga(c, 'Pedir instâncias', 'RPC · instâncias');
  liga(c, 'RPC · instâncias', 'Um item por instância');
  liga(c, 'Um item por instância', 'Evolution · estado');
  liga(c, 'Evolution · estado', 'Interpretar estado');
  liga(c, 'Interpretar estado', 'RPC · registrar conexão');
  liga(c, 'RPC · registrar conexão', 'Alertar?');
  liga(c, 'Alertar?', 'Montar e-mail', 0);
  liga(c, 'Montar e-mail', 'Resend · e-mail');
  grava('03-conexao-whatsapp.json', workflow('PetCare · Conexão WhatsApp', n, c));
}

// =========================================================== 4. Erros (PL-04)
{
  novoWf('4.');
  const n = [
    { parameters: {}, id: id(), name: 'Quando um workflow falhar', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0] },
    code('Montar erro', [220, 0], `
const j = $json; const ex = j.execution || {}; const wf = j.workflow || {};
const erro = ex.error || (j.trigger && j.trigger.error) || {};
const args = {
  p_workflow: wf.name || '?', p_no: ex.lastNodeExecuted || (erro.node && erro.node.name) || null,
  p_mensagem: String(erro.message || erro.description || 'erro sem mensagem').slice(0, 2000),
  p_execucao: ex.id ? String(ex.id) : null, p_url: ex.url || null, p_petshop: null,
};
return [{ json: { erro: args, resultados: {}, proximo: { chave: 'erro', fn: 'bot_registrar_erro', args } } }];`),
    rpcNode('RPC · registrar erro', [440, 0]),
    iff('Primeiro da hora?', [660, 0], '={{ !!($json.resultados.erro.body && $json.resultados.erro.body.enviar_email) || ($json.resultados.erro.status !== 200) }}', 'true', null, 'boolean'),
    code('Montar e-mail', [880, -60], `
const e = $json.erro;
return [{ json: { email: {
  assunto: \`🔴 Erro no N8n: \${e.p_workflow}\`,
  texto: \`Workflow: \${e.p_workflow}\\nNó: \${e.p_no || '-'}\\nErro: \${e.p_mensagem}\\nExecução: \${e.p_url || e.p_execucao || '-'}\\n\\nOutros erros da próxima hora ficam só na tabela fluxo_erros (sem e-mail).\`,
} } }];`),
    http('Resend · e-mail', [1100, -60], { url: 'https://api.resend.com/emails', cred: CRED_RESEND, body: RESEND_BODY }),
    nota('## Erros (PL-04)\nDefina este workflow como **Error Workflow** nos outros quatro (Settings).\nGrava em `fluxo_erros` e manda no máximo um e-mail por hora (o Resend gratuito tem teto de 100/dia).', [0, -280], 520, 200),
  ];
  const c = {};
  liga(c, 'Quando um workflow falhar', 'Montar erro');
  liga(c, 'Montar erro', 'RPC · registrar erro');
  liga(c, 'RPC · registrar erro', 'Primeiro da hora?');
  liga(c, 'Primeiro da hora?', 'Montar e-mail', 0);
  liga(c, 'Montar e-mail', 'Resend · e-mail');
  grava('04-erros.json', workflow('PetCare · Erros', n, c));
}

// =========================================================== 5. Canal de teste (chat do N8n)
{
  novoWf('5.');
  const n = [
    {
      parameters: {
        public: true, mode: 'hostedChat', authentication: 'basicAuth',
        initialMessages: 'Canal de teste do bot PetCare. Você é um tutor escrevendo para o Pet Feliz (TESTE).\nMande "oi" para começar ou "#ajuda" para ver os comandos.',
        options: { responseMode: 'responseNode', title: 'Bot PetCare · teste', subtitle: 'Conversa com o mesmo motor do WhatsApp', inputPlaceholder: 'Escreva como o tutor…', loadPreviousSession: 'notSupported' },
      },
      id: id(), name: 'Chat de teste', type: '@n8n/n8n-nodes-langchain.chatTrigger', typeVersion: 1.1,
      position: [0, 0], webhookId: id(), credentials: CRED_CHAT,
    },
    code('Normalizar chat', [220, 0], `
// Pet shop do teste: precisa ter bot_config.canal = 'teste' (arquivo 14).
const SLUG = 'pet-feliz-teste';

const AJUDA = [
  'Comandos do canal de teste:',
  '#novo · vira um tutor novo (telefone novo)',
  '#tel 19966665555 · usa esse telefone (ex.: a Elisa do seed, cliente do Pet Rival)',
  '#dono texto · simula o dono respondendo pelo celular (pausa o bot)',
  '#devolver · devolve a conversa ao bot',
  '#lembrete · manda o lembrete de amanhã deste telefone, se houver',
  '#estado · mostra o estado da conversa',
].join('\\n');

const msg = String($json.chatInput || '').trim();
const sessao = String($json.sessionId || 'sem-sessao');
const memo = $getWorkflowStaticData('global');
memo.telefones = memo.telefones || {};
const foneDe = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return '+5599' + String(h % 1e9).padStart(9, '0'); };
let tel = memo.telefones[sessao] || foneDe(sessao);
const direto = (t) => [{ json: { resposta_direta: t } }];

if (/^#ajuda/i.test(msg)) return direto(AJUDA + '\\n\\nTelefone desta conversa: ' + tel);
if (/^#novo/i.test(msg)) {
  tel = foneDe(sessao + ':' + Date.now()); memo.telefones[sessao] = tel;
  return direto('Agora você é um tutor novo, com o telefone ' + tel + '. Mande "oi".');
}
const mt = /^#tel\\s+(.+)$/i.exec(msg);
if (mt) {
  let d = mt[1].replace(/\\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.length < 12 || d.length > 15) return direto('Telefone inválido. Use DDD + número, por exemplo: #tel 19966665555');
  tel = '+' + d; memo.telefones[sessao] = tel;
  return direto('Agora você escreve do telefone ' + tel + '.');
}

const evento = { canal: 'teste', instance_id: SLUG, telefone: tel,
  message_id: 'teste-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), from_api: null };
const cmd = /^#(\\w+)/.exec(msg);
if (cmd) {
  const c = cmd[1].toLowerCase();
  if (c === 'dono') { evento.tipo = 'fromme'; }
  else if (['estado', 'devolver', 'lembrete'].includes(c)) { evento.tipo = 'comando'; evento.comando = c; }
  else return direto('Comando desconhecido. Mande #ajuda.');
} else {
  evento.tipo = 'texto'; evento.texto = msg;
}
return [{ json: { evento, resultados: {}, passos: 0, execucao_id: $execution.id } }];`),
    iff('Resposta direta?', [440, 0], '={{ !!$json.resposta_direta }}', 'true', null, 'boolean'),
    { parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ output: $json.resposta_direta }) }}', options: {} },
      id: id(), name: 'Responder comando', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [660, -140] },
    code('Motor (passo)', [660, 160], motor + `
// ---- N8n: um passo do motor por vez (o laço passa pelo sub-workflow de RPC)
return [{ json: passo($input.first().json) }];`),
    iff('Precisa de RPC?', [880, 160], '={{ $json.proximo.tipo }}', 'equals', 'rpc'),
    rpcNode('RPC Supabase', [880, 380]),
    code('Montar resposta', [1100, 60], `
// Mostra no chat o que iria para o WhatsApp: a resposta ao tutor e os avisos ao dono.
const p = $json.proximo || {};
const fone = $json.evento.telefone;
const partes = [];
for (const e of p.envios || []) {
  partes.push(e.para === fone ? e.texto : '📣 Aviso ao celular do dono (' + e.para + '):\\n' + e.texto);
}
if (!partes.length) partes.push('_(o bot não respondeu' + (p.nota ? ': ' + p.nota : '') + ')_');
else if (p.nota) partes.push('_' + p.nota + '_');
if (p.erro) partes.push('⚠️ ' + p.erro);
// O chat do N8n renderiza markdown: dois espaços antes da quebra mantêm a linha.
return [{ json: { output: partes.join('\\n\\n— — —\\n\\n').replace(/\\n/g, '  \\n'), envios: p.envios || [] } }];`),
    { parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ output: $json.output }) }}', options: {} },
      id: id(), name: 'Responder no chat', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1320, 60] },
    code('Preparar log', [1540, 60], `
// Registra as saídas em mensagens_log, como no WhatsApp (canal 'teste').
return ($json.envios || []).map((e) => ({ json: { resultados: {}, proximo: { chave: 'log', fn: 'bot_registrar_mensagem', args: {
  p_petshop: e.petshop_id, p_telefone: e.para, p_direcao: 'saida', p_tipo: e.tipo, p_status: 'enviada',
  p_agendamento: e.agendamento_id || null, p_id_externo: 'teste-saida-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), p_erro: null } } } }));`),
    rpcNode('RPC · registrar saída', [1760, 60]),
    nota('## Canal de teste\nConversa com o bot pelo chat do N8n, sem WhatsApp. Mesmo motor e mesmas funções do banco.\nO pet shop do teste precisa ter `bot_config.canal = \'teste\'` (arquivo 14). Troque o slug no nó "Normalizar chat" para testar outro.\nMande **#ajuda** no chat para ver os comandos.', [0, -320], 560, 220),
  ];
  const c = {};
  liga(c, 'Chat de teste', 'Normalizar chat');
  liga(c, 'Normalizar chat', 'Resposta direta?');
  liga(c, 'Resposta direta?', 'Responder comando', 0);
  liga(c, 'Resposta direta?', 'Motor (passo)', 1);
  liga(c, 'Motor (passo)', 'Precisa de RPC?');
  liga(c, 'Precisa de RPC?', 'RPC Supabase', 0);
  liga(c, 'Precisa de RPC?', 'Montar resposta', 1);
  liga(c, 'RPC Supabase', 'Motor (passo)');
  liga(c, 'Montar resposta', 'Responder no chat');
  liga(c, 'Responder no chat', 'Preparar log');
  liga(c, 'Preparar log', 'RPC · registrar saída');
  grava('05-canal-teste.json', workflow('PetCare · Canal de teste', n, c));
}

console.log('Workflows gerados em', saida);
