// =====================================================================
// PetCare Hub · Motor de conversa do bot (etapa 5)
// Cobre BT-01 a BT-06, BT-08 a BT-10, BT-12, BT-16 a BT-18, CM-01 e CM-03.
//
// Como funciona no N8n:
//   Motor → (precisa de RPC?) → sub-workflow "RPC Supabase" → Motor → … → fim
// O motor é uma função pura. Cada execução recomeça do topo e reaproveita os
// resultados já guardados em ctx.resultados[chave]; quando falta um, ele pede
// a RPC daquela chave e para. Por isso cada escrita no banco roda uma vez só.
// Regra de negócio fica no banco: o motor só conversa e chama funções.
//
// Este arquivo é a fonte. O build (n8n/build.mjs) copia o conteúdo para o nó
// "Motor (passo)" do workflow. Não edite o código dentro do N8n.
// =====================================================================

const MAX_PASSOS = 30;
const RODAPE = '\n_Digite 0 para voltar ao menu._';
const PORTES = [
  { codigo: 'P', nome: 'Pequeno' },
  { codigo: 'M', nome: 'Médio' },
  { codigo: 'G', nome: 'Grande' },
  { codigo: 'GG', nome: 'Gigante' },
];

class PrecisaRpc {
  constructor(chave, fn, args) { this.chave = chave; this.fn = fn; this.args = args; }
}
class ErroRpc extends Error {
  constructor(chave, fn, res) {
    super(`RPC ${fn} falhou (HTTP ${res && res.status}): ${JSON.stringify(res && res.body).slice(0, 400)}`);
    this.chave = chave; this.fn = fn; this.res = res;
  }
}

// ---------------------------------------------------------------- utilitários
const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[.!?,;:]+$/g, '').replace(/\s+/g, ' ').trim();
const num = (t) => (/^\d{1,2}$/.test(t) ? parseInt(t, 10) : null);
const reais = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const rotuloDia = (d) => {
  const [, m, dd] = String(d.dia).split('-');
  return `${d.dia_semana} ${dd}/${m}`;
};
const lista = (itens) => itens.map((x, i) => `*${i + 1}* · ${x}`).join('\n');
const ehOkHttp = (r) => r && r.status >= 200 && r.status < 300;

function simNao(t) {
  if (/^(sim|s|si|ss|confirmo|confirmado|confirma|ok|pode|pode sim|vou sim|claro|👍)$/.test(t)) return 'sim';
  if (/^(nao|n|nao vou|nao posso|cancela|cancelar|nao vou poder)$/.test(t)) return 'nao';
  return null;
}
// Saudação no meio de um fluxo: o bot cumprimenta e repete a pergunta em vez de "Não entendi".
const ehSaudacao = (t) => t.length <= 30 && /^(oi+|ola|opa|e ai|eai|hey|hello|bom dia|boa tarde|boa noite)\b/.test(t);
const ehMenu = (t) => /^(0|menu|inicio|voltar|recomecar)$/.test(t);
const ehAtendente = (t) => /(atendente|humano|falar com (alguem|uma pessoa|a equipe|voce)|pessoa de verdade)/.test(t);
function atalhoMenu(t) {
  const n = num(t);
  if (n >= 1 && n <= 4) return n;
  if (/^(quero )?(agendar|marcar|agendamento)/.test(t) || /(quero|gostaria de) (agendar|marcar)/.test(t)) return 1;
  if (/(meus agendamentos|consultar|ver agendamento|meu horario)/.test(t)) return 2;
  if (/^(quero )?cancelar/.test(t) || /desmarcar/.test(t)) return 3;
  return null;
}

// ------------------------------------------------------------------- entrada
function passo(ctx) {
  const resultados = ctx.resultados || {};
  const passos = ctx.passos || 0;
  const chamar = (chave, fn, args, opcoes) => {
    if (!(chave in resultados)) throw new PrecisaRpc(chave, fn, args);
    const r = resultados[chave];
    if (opcoes && opcoes.aceitarErro) return r;
    if (!ehOkHttp(r)) throw new ErroRpc(chave, fn, r);
    return r.body === '' || r.body === undefined ? null : r.body;
  };
  const pedir = (e) => {
    if (passos >= MAX_PASSOS) throw new Error(`Motor passou de ${MAX_PASSOS} RPCs numa mensagem`);
    return { ...ctx, proximo: { tipo: 'rpc', chave: e.chave, fn: e.fn, args: e.args } };
  };

  try {
    return { ...ctx, proximo: { tipo: 'fim', ...conversar(ctx, chamar) } };
  } catch (e) {
    if (e instanceof PrecisaRpc) return pedir(e);
    if (!(e instanceof ErroRpc)) throw e;
    // Falha numa RPC: registra (PL-04), responde com educação e mantém o estado.
    try {
      return { ...ctx, proximo: { tipo: 'fim', erro: e.message, ...falha(ctx, chamar, e) } };
    } catch (e2) {
      if (e2 instanceof PrecisaRpc) return pedir(e2);
      throw new Error(`${e.message} | e ao tratar a falha: ${e2.message}`);
    }
  }
}

function falha(ctx, rpc, err) {
  const r = (ctx.resultados || {}).petshop;
  const petshop = r && ehOkHttp(r) ? r.body : null;
  rpc('falha_registro', 'bot_registrar_erro', {
    p_workflow: 'PetCare · Bot conversa', p_no: `Motor · ${err.fn}`, p_mensagem: err.message,
    p_execucao: ctx.execucao_id || null, p_url: null, p_petshop: petshop,
  });
  if (!petshop || ctx.evento.tipo === 'fromme') return { envios: [] };
  const env = rpc('falha_envio', 'bot_envio', { p_petshop: petshop });
  return {
    envios: montarEnvios(petshop, env, [{
      para: ctx.evento.telefone,
      texto: 'Desculpe, tive um problema aqui. 😕 Tente de novo em instantes ou digite *4* para falar com a equipe.',
      tipo: 'conversa', agendamento_id: null,
    }]),
  };
}

function montarEnvios(petshop, env, msgs) {
  const canal = env && env.canal;
  if (canal === 'teste') {
    // Canal de teste: nada sai para o WhatsApp; o workflow devolve o texto no chat.
    return msgs.map((m) => ({ ...m, petshop_id: petshop, canal, phone: String(m.para).replace(/\D/g, '') }));
  }
  if (canal !== 'zapi' || !env.zapi_instance_id || !env.token) {
    throw new Error(`Pet shop sem canal configurado (canal ${canal || 'vazio'}, instância ou token no Vault)`);
  }
  return msgs.map((m) => ({
    ...m, petshop_id: petshop, canal, instancia: env.zapi_instance_id, token: env.token,
    phone: String(m.para).replace(/\D/g, ''),
  }));
}

// Texto do lembrete de 24 h (CM-02). O workflow de lembretes usa o mesmo texto.
function textoLembrete(l) {
  const nome = String(l.nome_tutor || '').split(' ')[0];
  return `Oi${nome ? ', ' + nome : ''}! Aqui é ${l.nome_bot || 'a assistente'} 🐾\n`
    + `Lembrete: amanhã (${l.data}) às ${l.hora} tem ${l.servicos || 'atendimento'} para ${l.pet}.\n\n`
    + 'Responda *SIM* para confirmar ou *NÃO* se não puder vir.\n'
    + '_Para não receber lembretes, responda SAIR._';
}

// Comandos do canal de teste (#estado, #devolver, #lembrete). #dono vira evento fromme.
function comandoTeste(ctx, rpc, petshop) {
  const ev = ctx.evento;
  const e = rpc('entrada', 'bot_entrada', { p_petshop: petshop, p_telefone: ev.telefone });
  if (ev.comando === 'estado') {
    const dados = Object.keys(e.dados_temp || {});
    return { envios: [], nota: `Estado: ${e.estado}${dados.length ? ' · dados_temp: ' + dados.join(', ') : ''} · conhecido aqui: ${e.conhecido_aqui ? 'sim' : 'não'} · bot ligado: ${e.bot && e.bot.ativo ? 'sim' : 'não'}` };
  }
  if (ev.comando === 'devolver') {
    if (e.estado !== 'humano') return { envios: [], nota: `A conversa não está pausada (estado ${e.estado}).` };
    rpc('devolver', 'bot_devolver', { p_conversa: e.conversa_id });
    return { envios: [], nota: 'Conversa devolvida ao bot.' };
  }
  if (ev.comando === 'lembrete') {
    const pend = (rpc('pend', 'lembretes_pendentes', { p_petshop: petshop }) || []).filter((l) => l.telefone === ev.telefone);
    if (!pend.length) {
      return { envios: [], nota: 'Nenhum lembrete pendente para este telefone. Precisa de um agendamento confirmado para amanhã, fora de período bloqueado, e o bot ligado.' };
    }
    const l = pend[0];
    const marcado = rpc('marcar', 'bot_lembrete_marcar', { p_agendamento: l.agendamento_id });
    if (marcado !== true) return { envios: [], nota: 'Esse lembrete já tinha sido enviado.' };
    const env = rpc('envio', 'bot_envio', { p_petshop: petshop });
    return { envios: montarEnvios(petshop, env, [{ para: ev.telefone, texto: textoLembrete(l), tipo: 'lembrete', agendamento_id: l.agendamento_id }]) };
  }
  return { envios: [], nota: `Comando desconhecido: ${ev.comando}` };
}

function conversar(ctx, rpc) {
  const ev = ctx.evento;
  const teste = ev.canal === 'teste';
  const petshop = teste
    ? rpc('petshop', 'bot_petshop_teste', { p_slug: ev.instance_id })
    : rpc('petshop', 'bot_petshop_por_instancia', { p_zapi_instance: ev.instance_id, p_meta_phone_id: null });
  if (!petshop) {
    return { envios: [], nota: teste
      ? `O pet shop "${ev.instance_id}" não está no canal de teste (bot_config.canal precisa ser 'teste').`
      : `instância desconhecida: ${ev.instance_id}` };
  }
  if (teste && ev.tipo === 'comando') return comandoTeste(ctx, rpc, petshop);

  if (ev.tipo === 'fromme') {
    const r = rpc('fromme', 'bot_registrar_fromme', {
      p_petshop: petshop, p_telefone: ev.telefone, p_message_id: ev.message_id || null, p_from_api: ev.from_api,
    });
    return { envios: [], nota: `fromMe: ${r}` };
  }

  rpc('log_entrada', 'bot_registrar_mensagem', {
    p_petshop: petshop, p_telefone: ev.telefone, p_direcao: 'entrada', p_tipo: 'conversa',
    p_status: 'recebida', p_agendamento: null, p_id_externo: ev.message_id || null, p_erro: null,
  });
  const e = rpc('entrada', 'bot_entrada', { p_petshop: petshop, p_telefone: ev.telefone });
  if (!e.bot || !e.bot.ativo) return { envios: [], nota: 'bot desligado neste pet shop' };
  if (e.estado === 'humano' || e.estado === 'bloqueado') return { envios: [], nota: `silêncio (${e.estado})` };

  const c = new Conversa(petshop, ev, e, rpc);
  c.processar();
  return c.finalizar();
}

// ------------------------------------------------------------------ conversa
class Conversa {
  constructor(petshop, ev, e, rpc) {
    this.petshop = petshop; this.ev = ev; this.e = e; this.rpc = rpc;
    this.estado = e.estado;
    this.dados = e.dados_temp || {};
    this.novoEstado = 'idle';
    this.salvar = true;
    this.respostas = [];
    this.avisos = [];
    this.tipo = 'conversa';
    this.agendamentoId = null;
  }

  // --- acesso ao banco
  info() {
    const i = this.rpc('info', 'bot_petshop_info', { p_petshop: this.petshop }) || {};
    const bot = this.e.bot || {};
    const nome = i.nome || (i.petshop && i.petshop.nome) || '';
    const nomeBot = i.nome_bot || (i.bot && i.bot.nome) || bot.nome || '';
    let saud = i.saudacao || (i.bot && i.bot.saudacao) || bot.saudacao || 'Oi! Como posso ajudar?';
    saud = saud.replace(/\{bot\}/g, nomeBot).replace(/\{petshop\}/g, nome);
    return { nome, saudacao: saud, endereco: i.endereco || null, telefone: i.telefone_contato || null };
  }
  aberto() { return this.rpc('aberto', 'bot_aberto_agora', { p_petshop: this.petshop }) || { aberto: true }; }
  tutorId(d) { return (d || this.dados).tutor_id || this.dados.tutor_id || this.e.tutor_id; }

  dizer(t) { this.respostas.push(t); }
  avisarDono(t) { this.avisos.push(t); }

  // --- roteamento
  processar() {
    const ev = this.ev;
    if (ev.tipo === 'midia') {   // BT-16
      this.dizer('Por aqui eu só consigo ler mensagens de texto. 🙂 Responda com o número da opção ou digite *menu*.\nSe precisar mandar um áudio ou foto, digite *4* que a equipe atende você.');
      this.salvar = false;
      return;
    }
    const t = norm(ev.texto);
    let est = this.estado;

    // TP-12: SAIR/PARAR/STOP desligam as mensagens automáticas; ATIVAR religa. Valem em qualquer passo.
    if (/^(sair|parar|stop)$/.test(t)) return this.mensagensAutomaticas(false);
    if (t === 'ativar') return this.mensagensAutomaticas(true);
    // TP-15: REVOGAR desfaz o consentimento de compartilhamento.
    if (t === 'revogar') return this.revogar();

    if (est === 'aguardando_consentimento') {
      const sn = simNao(t);
      if (sn) return this.respostaConsentimento(sn === 'sim');
      if (ehSaudacao(t) && this.repetir(this.cumprimento())) return;
      // Outra coisa: conta como "não" (silêncio não é consentimento) e segue como conversa normal.
      this.respostaConsentimento(false, true);
      est = this.estado = 'idle';
    }

    if (['novo', 'idle', 'menu'].includes(est)) {
      const sn = simNao(t);
      if (sn) {
        const r = this.rpc('lembrete', 'bot_responder_lembrete', { p_petshop: this.petshop, p_telefone: ev.telefone, p_resposta: sn });
        if (r && r.encontrado) return this.respostaLembrete(r);
      }
    }
    if (ehAtendente(t)) return this.transbordo();
    if (ehMenu(t) && est !== 'novo') return this.menu();
    if (ehSaudacao(t) && this.repetir(this.cumprimento())) return;

    switch (est) {
      case 'novo': { const a = atalhoMenu(t); return a ? this.escolhaMenu(a) : this.boasVindas(); }
      case 'idle': { const a = atalhoMenu(t); return a ? this.escolhaMenu(a) : this.saudacaoConhecido(); }
      case 'menu': return this.escolhaMenu(atalhoMenu(t));
      case 'aguardando_nome': return this.recebeNomeTutor();
      case 'aguardando_pet': return this.recebePet(t);
      case 'aguardando_nome_pet': return this.recebeNomePet();
      case 'aguardando_porte': return this.recebePorte(t);
      case 'aguardando_servico': return this.recebeServico(t);
      case 'aguardando_data': return this.recebeData(t);
      case 'aguardando_hora': return this.recebeHora(t);
      case 'aguardando_confirmacao': return this.recebeConfirmacao(t);
      case 'aguardando_cancelamento': return this.recebeCancelamento(t);
      default: return this.menu();
    }
  }

  // --- menu e saudação (BT-01, BT-02, BT-12)
  textoMenu() {
    return 'Como posso ajudar? Responda com o número:\n'
      + lista(['Agendar um horário', 'Ver meus agendamentos', 'Cancelar um agendamento', 'Falar com a equipe']);
  }
  linhaFechado() {
    const a = this.aberto();
    if (a.aberto || !a.proxima_abertura) return '';
    return `⏰ A loja está fechada agora e abre ${a.proxima_abertura}. Pelo WhatsApp eu agendo a qualquer hora.\n\n`;
  }
  boasVindas() {
    let saud = this.info().saudacao;
    const nome = this.nomeTutor();
    if (nome) {
      // "Oi, eu sou a Luna…" vira "Oi, Elisa! Eu sou a Luna…"
      const m = /^(oi|olá|ola|oie)[\s,!.]*/i.exec(saud);
      saud = m ? `Oi, ${nome}! ` + saud.slice(m[0].length).replace(/^./, (c) => c.toUpperCase()) : `Oi, ${nome}! ${saud}`;
    }
    this.dizer(`${saud}\n\n${this.linhaFechado()}${this.textoMenu()}`);
    this.novoEstado = 'menu'; this.dados = {};
  }
  saudacaoConhecido() {
    const nome = primeiroNome(this.e.nome_tutor);
    this.dizer(`Oi${nome ? ', ' + nome : ''}! 🐾\n\n${this.linhaFechado()}${this.textoMenu()}`);
    this.novoEstado = 'menu'; this.dados = {};
  }
  menu(prefixo) {
    this.dizer((prefixo || '') + this.textoMenu());
    this.novoEstado = 'menu'; this.dados = {};
  }
  // Nome do tutor: o do vínculo daqui; senão, o compartilhado com consentimento (arquivo 15).
  nomeCompartilhado() {
    if (this.e.conhecido_aqui || !this.e.tutor_id || !(this.e.pets_compartilhaveis || []).length) return null;
    return this.rpc('nome_comp', 'bot_nome_compartilhado', { p_tutor: this.e.tutor_id }) || null;
  }
  nomeCompleto() { return this.dados.nome_tutor || (this.e.conhecido_aqui ? this.e.nome_tutor : this.nomeCompartilhado()) || ''; }
  nomeTutor() { return primeiroNome(this.nomeCompleto()); }
  cumprimento() { const n = this.nomeTutor(); return `Oi${n ? ', ' + n : ''}! 🙂 `; }
  // Repete a pergunta do estado atual com um prefixo. Devolve false se o estado não é de pergunta.
  // Estados de nome (tutor e pet) ficam de fora: "Oi" ali pode ser uma resposta.
  repetir(prefixo) {
    switch (this.estado) {
      case 'aguardando_pet': return this.perguntarPet(prefixo), true;
      case 'aguardando_porte': return this.perguntarPorte(prefixo), true;
      case 'aguardando_servico': return this.oferecerServicos(prefixo), true;
      case 'aguardando_data': return this.perguntarDia(prefixo), true;
      case 'aguardando_hora': return this.oferecerHoras('horas', prefixo), true;
      case 'aguardando_confirmacao': return this.resumo(prefixo), true;
      case 'aguardando_cancelamento': return this.iniciarCancelamento(prefixo), true;
      case 'aguardando_consentimento': return this.dizer(prefixo + this.dados.termo_texto), (this.novoEstado = 'aguardando_consentimento'), true;
      default: return false;
    }
  }
  escolhaMenu(n) {
    if (n === 1) return this.iniciarAgendamento();
    if (n === 2) return this.consultar();
    if (n === 3) return this.iniciarCancelamento();
    if (n === 4) return this.transbordo();
    return this.menu('Não entendi. 🙂 ');
  }

  // --- agendar: pet (BT-03, BT-04, BT-17)
  iniciarAgendamento() {
    const aqui = (this.e.pets || []).map((p) => ({ id: p.id, nome: p.nome, porte: p.porte, origem: 'aqui' }));
    const comp = (this.e.pets_compartilhaveis || []).map((p) => ({ id: p.id, nome: p.nome, porte: p.porte, origem: 'comp' }));
    const opcoes = [...aqui, ...comp];
    // Quem ainda não é cliente deste pet shop e não tem nome compartilhado informa o nome primeiro.
    // Com consentimento, o nome vem junto com os pets (decisão de 08/11/2026).
    if (!this.e.conhecido_aqui && !this.nomeCompartilhado()) {
      this.dados = { opcoes_pet: opcoes };
      return this.pedirNomeTutor();
    }
    if (!opcoes.length) {
      this.dados = {};
      return this.pedirNomePet();
    }
    this.dados = { opcoes_pet: opcoes };
    this.perguntarPet();
  }
  perguntarPet(prefixo) {
    const ops = this.dados.opcoes_pet;
    // BT-17: pets de outro pet shop aparecem iguais aos daqui, sem citar a origem.
    this.dizer(`${prefixo || ''}Para qual pet é o horário?\n${lista(ops.map((p) => p.nome))}\n*${ops.length + 1}* · Outro pet${RODAPE}`);
    this.novoEstado = 'aguardando_pet';
  }
  recebePet(t) {
    const ops = this.dados.opcoes_pet || [];
    const n = num(t);
    if (n && n <= ops.length) {
      const p = ops[n - 1];
      if (p.origem === 'comp') {
        this.rpc('vincular', 'bot_vincular_pet_compartilhado', { p_petshop: this.petshop, p_tutor: this.tutorId(), p_pet: p.id });
      }
      this.dados = { tutor_id: this.dados.tutor_id, nome_tutor: this.dados.nome_tutor, pet: { id: p.id, nome: p.nome, porte: p.porte } };
      return this.oferecerServicos();
    }
    if (n === ops.length + 1) {
      this.dados = { tutor_id: this.dados.tutor_id, nome_tutor: this.dados.nome_tutor };
      if (!this.e.conhecido_aqui && !this.dados.tutor_id) {
        // Pet novo de quem ainda não tem vínculo aqui: cria o vínculo com o nome compartilhado.
        const nome = this.nomeCompartilhado();
        if (!nome) return this.pedirNomeTutor();
        this.dados = { tutor_id: this.rpc('cad_tutor', 'bot_cadastrar_tutor', { p_petshop: this.petshop, p_telefone: this.ev.telefone, p_nome: nome }), nome_tutor: nome };
      }
      return this.pedirNomePet();
    }
    this.perguntarPet('Não entendi. 🙂 ');
  }
  pedirNomeTutor() {
    this.dizer('Que bom ter você aqui! 😊 Para começar, qual é o seu nome?');
    this.novoEstado = 'aguardando_nome';
  }
  recebeNomeTutor() {
    const nome = String(this.ev.texto || '').trim().replace(/\s+/g, ' ');
    if (nome.length < 2 || nome.length > 60 || /^\d+$/.test(nome)) {
      this.dizer('Pode me dizer o seu nome? (só o nome, por favor)');
      this.novoEstado = 'aguardando_nome';
      return;
    }
    const tutor = this.rpc('cad_tutor', 'bot_cadastrar_tutor', { p_petshop: this.petshop, p_telefone: this.ev.telefone, p_nome: nome });
    const opcoes = this.dados.opcoes_pet || [];
    this.dados = { tutor_id: tutor, nome_tutor: nome };
    if (opcoes.length) {
      // Pets compartilháveis (BT-17): aparecem como os daqui, sem citar a origem.
      this.dados.opcoes_pet = opcoes;
      return this.perguntarPet(`Prazer, ${primeiroNome(nome)}! `);
    }
    this.pedirNomePet(`Prazer, ${primeiroNome(nome)}! `);
  }
  pedirNomePet(prefixo) {
    this.dizer(`${prefixo || ''}Qual é o nome do seu pet?`);
    this.novoEstado = 'aguardando_nome_pet';
  }
  recebeNomePet() {
    const nome = String(this.ev.texto || '').trim().replace(/\s+/g, ' ');
    if (nome.length < 1 || nome.length > 40 || /^\d+$/.test(nome)) {
      this.dizer('Qual é o nome do seu pet?');
      this.novoEstado = 'aguardando_nome_pet';
      return;
    }
    this.dados = { ...this.dados, pet_nome: nome };
    this.perguntarPorte();
  }
  perguntarPorte(prefixo) {
    this.dizer(`${prefixo || ''}Qual é o porte de ${this.dados.pet_nome}?\n${lista(PORTES.map((p) => p.nome))}\n_Na dúvida, escolha o mais próximo: a equipe confere no atendimento._`);
    this.novoEstado = 'aguardando_porte';
  }
  recebePorte(t) {
    const n = num(t);
    const porPalavra = { pequeno: 'P', p: 'P', medio: 'M', m: 'M', grande: 'G', g: 'G', gigante: 'GG', gg: 'GG' };
    const porte = n && n <= 4 ? PORTES[n - 1].codigo : porPalavra[t];
    if (!porte) return this.perguntarPorte('Não entendi. 🙂 ');
    const pet = this.rpc('cad_pet', 'cadastrar_pet', {
      p_petshop: this.petshop, p_tutor: this.tutorId(), p_nome: this.dados.pet_nome, p_porte: porte,
      p_especie: 'cao', p_raca: null, p_nascimento: null,
    });
    this.dados = { tutor_id: this.dados.tutor_id, nome_tutor: this.dados.nome_tutor, pet: { id: pet, nome: this.dados.pet_nome, porte } };
    this.oferecerServicos();
  }

  // --- agendar: serviço, dia, hora, confirmação
  oferecerServicos(prefixo) {
    const pet = this.dados.pet;
    const servs = this.rpc('servicos', 'bot_servicos', { p_petshop: this.petshop, p_porte: pet.porte }) || [];
    if (!servs.length) {
      return this.menu('No momento não consigo agendar pelo WhatsApp para esse porte. Digite *4* para falar com a equipe.\n\n');
    }
    this.dados = { ...this.dados, opcoes_servico: servs.map((s) => ({ id: s.id, nome: s.nome, preco: s.preco })) };
    this.dizer(`${prefixo || ''}Qual serviço para ${pet.nome}?\n${lista(servs.map((s) => `${s.nome} — ${reais(s.preco)}`))}${RODAPE}`);
    this.novoEstado = 'aguardando_servico';
  }
  recebeServico(t) {
    const ops = this.dados.opcoes_servico || [];
    const n = num(t);
    if (!n || n > ops.length) return this.oferecerServicos('Não entendi. 🙂 ');
    const { opcoes_servico, ...resto } = this.dados;
    this.dados = { ...resto, servico: ops[n - 1] };
    this.oferecerDias('dias');
  }
  oferecerDias(chave, prefixo) {
    const d = this.dados;
    const dias = (this.rpc(chave, 'proximos_dias_com_vaga', {
      p_petshop: this.petshop, p_servicos: [d.servico.id], p_porte: d.pet.porte, p_dias: 7,
    }) || []).filter((x) => Number(x.horarios) > 0);
    if (!dias.length) {
      return this.menu(`${prefixo || ''}Não encontrei vaga para ${d.servico.nome} nos próximos 7 dias. 😕 Digite *4* para falar com a equipe.\n\n`);
    }
    const opcoes = dias.map((x) => ({ dia: x.dia, rotulo: rotuloDia(x) }));
    const { opcoes_dia, opcoes_hora, dia, hora, ...resto } = d;
    this.dados = { ...resto, opcoes_dia: opcoes };
    this.dizer(`${prefixo || ''}Qual dia fica melhor?\n${lista(dias.map((x, i) => `${opcoes[i].rotulo} (${x.horarios} ${Number(x.horarios) === 1 ? 'horário' : 'horários'})`))}${RODAPE}`);
    this.novoEstado = 'aguardando_data';
  }
  perguntarDia(prefixo) {
    const ops = this.dados.opcoes_dia || [];
    this.dizer(`${prefixo || ''}Qual dia fica melhor? Responda com o número:\n${lista(ops.map((o) => o.rotulo))}${RODAPE}`);
    this.novoEstado = 'aguardando_data';
  }
  recebeData(t) {
    const ops = this.dados.opcoes_dia || [];
    const n = num(t);
    if (!n || n > ops.length) return this.perguntarDia('Não entendi. 🙂 ');
    const { opcoes_dia, ...resto } = this.dados;
    this.dados = { ...resto, dia: ops[n - 1] };
    this.oferecerHoras('horas');
  }
  oferecerHoras(chave, prefixo) {
    const d = this.dados;
    const horas = this.rpc(chave, 'horarios_livres_resumo', {
      p_petshop: this.petshop, p_servicos: [d.servico.id], p_porte: d.pet.porte, p_data: d.dia.dia,
    }) || [];
    if (!horas.length) return this.oferecerDias(chave + '_dias', `${prefixo || ''}O dia ${d.dia.rotulo} acabou de lotar. 😕 `);
    const opcoes = horas.slice(0, 24).map((h) => ({ inicio: h.inicio, hora: h.hora }));
    const { opcoes_hora, hora, ...resto } = d;
    this.dados = { ...resto, opcoes_hora: opcoes };
    const linhas = [];
    for (let i = 0; i < opcoes.length; i += 3) {
      linhas.push(opcoes.slice(i, i + 3).map((o, j) => `*${i + j + 1}* ${o.hora}`).join('    '));
    }
    this.dizer(`${prefixo || ''}Horários livres em ${d.dia.rotulo}:\n${linhas.join('\n')}${RODAPE}`);
    this.novoEstado = 'aguardando_hora';
  }
  recebeHora(t) {
    const ops = this.dados.opcoes_hora || [];
    const n = num(t);
    if (!n || n > ops.length) return this.oferecerHoras('horas', 'Não entendi. 🙂 ');
    const { opcoes_hora, ...resto } = this.dados;
    this.dados = { ...resto, hora: ops[n - 1] };
    this.resumo();
  }
  resumo(prefixo) {
    const d = this.dados;
    this.dizer(`${prefixo || ''}Confere se está tudo certo:\n🐾 *${d.pet.nome}*\n✂️ ${d.servico.nome}\n📅 ${d.dia.rotulo} às ${d.hora.hora}\n💰 ${reais(d.servico.preco)}\n\n`
      + lista(['Confirmar', 'Escolher outro horário', 'Desistir']));
    this.novoEstado = 'aguardando_confirmacao';
  }
  recebeConfirmacao(t) {
    const n = num(t) || (simNao(t) === 'sim' ? 1 : null);
    const d = this.dados;
    if (n === 1) {
      const r = this.rpc('reserva', 'reservar_agendamento', {
        p_petshop: this.petshop, p_pet: d.pet.id, p_tutor: this.tutorId(), p_servicos: [d.servico.id],
        p_inicio: d.hora.inicio, p_recurso: null, p_origem: 'bot', p_observacoes: null, p_encaixe: false, p_status: 'confirmado',
      }, { aceitarErro: true });
      if (ehOkHttp(r)) {
        const ag = r.body || {};
        const info = this.info();
        this.tipo = 'confirmacao';   // CM-01
        this.agendamentoId = ag.id || null;
        this.dizer(`Agendado! ✅\n🐾 ${d.pet.nome} · ${d.servico.nome}\n📅 ${d.dia.rotulo} às ${d.hora.hora}`
          + (info.endereco ? `\n📍 ${info.endereco}` : '')
          + '\n\nNa véspera eu mando um lembrete. Para ver ou cancelar, é só digitar *menu*.');
        this.novoEstado = 'idle'; this.dados = {};
        // TP-15: depois do agendamento, uma vez por pet shop, pede o consentimento de compartilhamento.
        const termo = this.rpc('consent', 'bot_consentimento_pendente', { p_petshop: this.petshop, p_tutor: this.tutorId(d) });
        if (termo && termo.versao) {
          const texto = String(termo.texto).replace(/\{petshop\}/g, info.nome).replace(/\{pet\}/g, d.pet.nome);
          this.dizer(texto);
          this.novoEstado = 'aguardando_consentimento';
          this.dados = { termo_versao: termo.versao, termo_texto: texto, pet_nome: d.pet.nome, tutor_id: this.tutorId(d) };
        }
        return;
      }
      // Conflito: decide pelo code, nunca pelo status HTTP (PostgREST manda 400).
      if (r && r.body && r.body.code === '23P01') {
        return this.oferecerHoras('horas_conflito', 'Esse horário acabou de ser reservado. 😕 ');
      }
      throw new ErroRpc('reserva', 'reservar_agendamento', r);
    }
    if (n === 2) return this.oferecerHoras('horas_de_novo');
    if (n === 3) {
      this.dizer('Tudo bem, não agendei nada. Quando quiser, é só digitar *menu*.');
      this.novoEstado = 'idle'; this.dados = {};
      return;
    }
    this.resumo('Não entendi. 🙂 ');
  }

  // --- consultar e cancelar (BT-05, BT-06)
  agendamentos(chave) {
    if (!this.e.tutor_id || !this.e.conhecido_aqui) return [];
    return this.rpc(chave, 'bot_agendamentos_tutor', { p_petshop: this.petshop, p_tutor: this.e.tutor_id }) || [];
  }
  consultar() {
    const ags = this.agendamentos('ags');
    if (!ags.length) {
      this.dizer('Você não tem agendamentos futuros por aqui. Para marcar, digite *1*.');
    } else {
      this.dizer('Seus próximos agendamentos:\n'
        + ags.map((a) => `• ${a.data} às ${a.hora} — ${a.pet} (${a.servicos})`).join('\n')
        + '\n\nPara cancelar, digite *3*. Para o menu, *0*.');
    }
    this.novoEstado = 'idle'; this.dados = {};
  }
  iniciarCancelamento(prefixo) {
    const ags = this.agendamentos('ags');
    const podem = ags.filter((a) => a.pode_cancelar);
    this.novoEstado = 'idle'; this.dados = {};
    if (!ags.length) return this.dizer('Você não tem agendamentos futuros por aqui.');
    if (!podem.length) {
      return this.dizer('O prazo para cancelar pelo WhatsApp já passou para os seus próximos horários. Digite *4* para falar com a equipe.');
    }
    this.dados = { opcoes_cancel: podem.map((a) => ({ id: a.id, rotulo: `${a.data} às ${a.hora} — ${a.pet} (${a.servicos})` })) };
    this.dizer(`${prefixo || ''}Qual agendamento você quer cancelar?\n${lista(this.dados.opcoes_cancel.map((o) => o.rotulo))}${RODAPE}`);
    this.novoEstado = 'aguardando_cancelamento';
  }
  recebeCancelamento(t) {
    const ops = this.dados.opcoes_cancel || [];
    const n = num(t);
    if (!n || n > ops.length) return this.iniciarCancelamento('Não entendi. 🙂 ');
    const op = ops[n - 1];
    const ok = this.rpc('cancelar', 'bot_cancelar', { p_petshop: this.petshop, p_tutor: this.e.tutor_id, p_agendamento: op.id });
    this.novoEstado = 'idle'; this.dados = {};
    if (ok === true) {
      this.tipo = 'cancelamento'; this.agendamentoId = op.id;
      this.dizer(`Cancelado. ✅ ${op.rotulo}\nSe quiser marcar outro dia, é só digitar *1*.`);
      this.avisarDono(`❌ Cancelamento pelo WhatsApp\n${this.e.nome_tutor || this.ev.telefone} cancelou: ${op.rotulo}.`);   // CM-03
    } else {
      this.dizer('Não consegui cancelar: o prazo pelo WhatsApp já passou ou o horário mudou. Digite *4* para falar com a equipe.');
    }
  }

  // --- lembrete (CM-02 resposta, CM-03)
  respostaLembrete(r) {
    this.agendamentoId = r.agendamento_id; this.novoEstado = 'idle'; this.dados = {};
    if (r.acao === 'confirmado') {
      this.dizer(`Obrigado! Confirmado para ${r.data} às ${r.hora}. Até lá! 🐾`);
    } else {
      this.tipo = 'cancelamento';
      this.dizer(`Tudo bem, cancelei o horário de ${r.pet} em ${r.data} às ${r.hora}. Se quiser marcar outro dia, é só digitar *1*.`);
      this.avisarDono(`❌ Cancelamento pelo lembrete\n${r.nome_tutor || this.ev.telefone} cancelou ${r.pet}, ${r.data} às ${r.hora}. O horário ficou livre na agenda.`);
    }
  }

  // --- consentimento e opt-out (TP-12, TP-15)
  respostaConsentimento(aceite, semResposta) {
    const d = this.dados;
    const tutor = d.tutor_id || this.e.tutor_id;
    this.rpc('consent_reg', 'bot_registrar_consentimento', {
      p_petshop: this.petshop, p_tutor: tutor, p_aceite: aceite, p_versao: d.termo_versao,
      p_evidencia: { canal: 'bot', message_id: this.ev.message_id || null, resposta: String(this.ev.texto || '').slice(0, 60), sem_resposta: !!semResposta },
    });
    this.novoEstado = 'idle'; this.dados = {};
    if (semResposta) return;
    const pet = d.pet_nome || 'seu pet';
    this.dizer(aceite
      ? `Obrigado! ✅ Os dados do ${pet} ficam disponíveis nos pet shops do PetCare Hub que você visitar. Para desfazer, é só responder *REVOGAR*.`
      : `Tudo bem! Os dados do ${pet} ficam só aqui no ${this.info().nome}. 🙂`);
  }
  mensagensAutomaticas(aceita) {
    const ok = this.rpc('msgs', 'bot_definir_mensagens', { p_petshop: this.petshop, p_telefone: this.ev.telefone, p_aceita: aceita });
    this.salvar = false;   // não mexe no passo em que a conversa estava
    const nome = this.info().nome;
    if (!ok) return this.dizer('Por aqui você ainda não recebe mensagens automáticas. 🙂 Para o menu, digite *menu*.');
    this.dizer(aceita
      ? `Pronto! Você volta a receber os lembretes do ${nome}. 🐾`
      : `Pronto, você não vai mais receber lembretes automáticos do ${nome}. Para voltar a receber, responda *ATIVAR*. Pode continuar falando comigo normalmente.`);
  }
  revogar() {
    this.salvar = false;
    const ok = this.e.tutor_id ? this.rpc('revogar', 'bot_revogar_consentimento', { p_tutor: this.e.tutor_id }) : false;
    this.dizer(ok
      ? 'Feito. ✅ Os dados do seu pet e o seu nome deixam de ser compartilhados com outros pet shops do PetCare Hub. O cadastro aqui continua como está.'
      : 'Você não tinha autorizado o compartilhamento, então não há nada a desfazer. 🙂');
  }

  // --- transbordo (BT-08, BT-12)
  transbordo() {
    const a = this.aberto();
    this.rpc('pausa', 'bot_pausar_por_humano', { p_petshop: this.petshop, p_telefone: this.ev.telefone });
    this.salvar = false;   // a pausa já gravou o estado 'humano'
    this.tipo = 'transbordo';
    this.dizer(a.aberto || !a.proxima_abertura
      ? 'Certo! Chamei a equipe e alguém responde por aqui em breve. 🙋'
      : `Certo! Avisei a equipe. A loja está fechada agora e abre ${a.proxima_abertura}; respondemos por aqui assim que possível. 🙋`);
    this.avisarDono(`🙋 ${this.e.nome_tutor || 'Um cliente'} (${this.ev.telefone}) pediu para falar com a equipe no WhatsApp. O bot fica em silêncio nessa conversa até você responder ou por algumas horas.`);
  }

  // --- fechamento: grava estado e monta os envios
  finalizar() {
    if (this.salvar) {
      this.rpc('salvar', 'bot_salvar_estado', {
        p_conversa: this.e.conversa_id, p_estado: this.novoEstado,
        p_dados_temp: this.novoEstado === 'idle' ? {} : this.dados,
      });
    }
    if (!this.respostas.length && !this.avisos.length) return { envios: [] };
    const env = this.rpc('envio', 'bot_envio', { p_petshop: this.petshop });
    const msgs = [];
    if (this.respostas.length) {
      msgs.push({ para: this.ev.telefone, texto: this.respostas.join('\n\n'), tipo: this.tipo, agendamento_id: this.agendamentoId });
    }
    if (this.avisos.length && env && env.telefone_avisos && env.telefone_avisos !== this.ev.telefone) {
      msgs.push({ para: env.telefone_avisos, texto: this.avisos.join('\n\n'), tipo: 'alerta_dono', agendamento_id: this.agendamentoId });
    }
    return { envios: montarEnvios(this.petshop, env, msgs), estado: this.salvar ? this.novoEstado : 'humano' };
  }
}

// Exporta para testes em Node; no N8n o build acrescenta a chamada ao final.

// ---- N8n: um passo do motor por vez (o laço passa pelo sub-workflow de RPC)
return [{ json: passo($input.first().json) }];
