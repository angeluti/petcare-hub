// =====================================================================
// Testes do número central (ACHEI e FICHA) no motor de conversa.
// Sem banco e sem dependências: as funções do banco são respondidas por um
// mapa fixo. Uso: node n8n/test/central.test.js
// O comportamento do banco (arquivo 21) é testado em supabase/testes/aceite_ficha.sql.
// =====================================================================
const assert = require('assert');
const { passo, lerComando } = require('../src/motor-conversa.js');

const CENTRAL = '+5519900000303';
const TUTOR = '+5519911112222';
const ACHADOR = '+5519933334444';

// Roda o motor até o fim, respondendo cada RPC pelo mapa. Devolve o resultado e as RPCs chamadas.
function rodar(evento, mapa) {
  let ctx = { evento, resultados: {}, passos: 0 };
  const chamadas = [];
  for (let i = 0; i < 40; i++) {
    const r = passo(ctx);
    if (r.proximo.tipo === 'fim') return { fim: r.proximo, chamadas };
    const { chave, fn, args } = r.proximo;
    chamadas.push({ fn, args });
    if (!(fn in mapa)) throw new Error('RPC sem resposta no teste: ' + fn);
    const v = typeof mapa[fn] === 'function' ? mapa[fn](args) : mapa[fn];
    ctx = { ...r, proximo: undefined, resultados: { ...r.resultados, [chave]: { status: 200, body: v } }, passos: r.passos + 1 };
  }
  throw new Error('motor não terminou');
}

const base = (extra = {}) => ({
  bot_petshop_por_canal: null,
  bot_canal_plataforma: { funcao: 'achados', canal: 'evolution', instancia: 'petcarehub-achados', ativo: true },
  bot_central_entrada: { estado: 'idle', dados: {} },
  bot_central_salvar: null,
  bot_envio_plataforma: { canal: 'evolution', instancia: 'petcarehub-achados', telefone: CENTRAL, ativo: true },
  ...extra,
});
const ev = (texto, tel = ACHADOR, tipo = 'texto') => ({
  canal: 'evolution', instance_id: 'petcarehub-achados', telefone: tel, tipo, texto, message_id: 'm-' + Math.random(),
});

let n = 0;
const caso = (nome, f) => { f(); n++; console.log('ok ·', nome); };

caso('lerComando entende o texto da página e variações', () => {
  assert.deepStrictEqual(lerComando('ACHEI K7M3QX\nRecado: Estou na praça'), { cmd: 'achei', codigo: 'K7M3QX', resto: 'Estou na praça' });
  assert.strictEqual(lerComando('achei o pet da plaquinha k7m3qx').codigo, 'K7M3QX');
  assert.strictEqual(lerComando('Achei o cachorro!').codigo, null);
  assert.strictEqual(lerComando('bom dia'), null);
});

caso('ACHEI encaminha ao tutor e agradece quem achou, sem dado do tutor', () => {
  const { fim, chamadas } = rodar(ev('ACHEI K7M3QX\nRecado: Estou na praça da matriz'), base({
    bot_achado_registrar: (a) => {
      assert.strictEqual(a.p_codigo, 'K7M3QX');
      assert.strictEqual(a.p_mensagem, 'Estou na praça da matriz');
      return { resultado: 'encaminhado', telefone_tutor: TUTOR, pet_nome: 'Thor', pet_nome_publico: null,
        codigo: 'K7M3QX', telefone_achador: ACHADOR, mensagem: 'Estou na praça da matriz' };
    },
  }));
  assert.ok(chamadas.some((c) => c.fn === 'bot_canal_plataforma'));
  assert.strictEqual(fim.envios.length, 2);
  const tutor = fim.envios.find((e) => e.para === TUTOR);
  const achador = fim.envios.find((e) => e.para === ACHADOR);
  assert.ok(/Thor/.test(tutor.texto) && /wa\.me\/5519933334444/.test(tutor.texto) && /praça da matriz/.test(tutor.texto));
  assert.ok(!/Thor/.test(achador.texto), 'ficha desligada: quem achou não recebe o nome do pet');
  assert.ok(!achador.texto.includes(TUTOR.slice(3)), 'quem achou não recebe o telefone do tutor');
  for (const e of fim.envios) {
    assert.strictEqual(e.instancia, 'petcarehub-achados');
    assert.strictEqual(e.petshop_id, null);
  }
});

caso('ACHEI sem recado pede onde estão; limite e indisponível respondem só a quem achou', () => {
  let r = rodar(ev('ACHEI K7M3QX'), base({ bot_achado_registrar: { resultado: 'encaminhado', telefone_tutor: TUTOR,
    pet_nome: 'Thor', pet_nome_publico: 'Thor', codigo: 'K7M3QX', telefone_achador: ACHADOR, mensagem: null } }));
  assert.ok(/onde vocês estão/.test(r.fim.envios.find((e) => e.para === ACHADOR).texto));
  r = rodar(ev('ACHEI K7M3QX'), base({ bot_achado_registrar: { resultado: 'limite' } }));
  assert.strictEqual(r.fim.envios.length, 1);
  r = rodar(ev('ACHEI ZZZZZZ'), base({ bot_achado_registrar: { resultado: 'indisponivel' } }));
  assert.ok(/Não encontrei/.test(r.fim.envios[0].texto));
});

caso('FICHA mostra o termo e a escolha 2 grava a ficha completa', () => {
  let salvo = null;
  let r = rodar(ev('FICHA K7M3QX', TUTOR), base({
    bot_ficha_consultar: { resultado: 'ok', codigo: 'K7M3QX', pet_nome: 'Thor', nivel: 'desligada',
      termo_versao: 'ficha-v0', termo_texto: 'A plaquinha do {pet}... FICHA {codigo}' },
    bot_central_salvar: (a) => { salvo = a; return null; },
  }));
  assert.ok(/A plaquinha do Thor/.test(r.fim.envios[0].texto) && /FICHA K7M3QX/.test(r.fim.envios[0].texto));
  assert.strictEqual(salvo.p_estado, 'aguardando_ficha');
  r = rodar(ev('2', TUTOR), base({
    bot_central_entrada: { estado: 'aguardando_ficha', dados: salvo.p_dados },
    bot_ficha_definir: (a) => { assert.strictEqual(a.p_escolha, 'completa'); assert.strictEqual(a.p_versao, 'ficha-v0'); return 'completa'; },
  }));
  assert.ok(/completa/.test(r.fim.envios[0].texto));
});

caso('FICHA de quem não é o tutor não revela nada', () => {
  const r = rodar(ev('FICHA K7M3QX'), base({ bot_ficha_consultar: { resultado: 'nao_tutor' } }));
  assert.ok(/Não encontrei uma plaquinha ativa sua/.test(r.fim.envios[0].texto));
  assert.ok(!/Thor/.test(r.fim.envios[0].texto));
});

caso('texto solto recebe a ajuda; fromMe é ignorado; número central desligado não envia', () => {
  let r = rodar(ev('oi, boa tarde'), base());
  assert.ok(/pets encontrados/.test(r.fim.envios[0].texto));
  r = rodar({ ...ev(null), tipo: 'fromme' }, base());
  assert.strictEqual(r.fim.envios.length, 0);
  r = rodar(ev('oi'), base({ bot_envio_plataforma: { canal: 'evolution', instancia: 'petcarehub-achados', ativo: false } }));
  assert.strictEqual(r.fim.envios.length, 0);
});

caso('instância de pet shop não consulta o número central', () => {
  const r = rodar({ ...ev('oi'), instance_id: 'pata-amiga' }, {
    bot_petshop_por_canal: 'uuid-pata',
    bot_registrar_mensagem: 'log',
    bot_entrada: { conversa_id: 'c', estado: 'idle', bot: { ativo: false } },
  });
  assert.ok(!r.chamadas.some((c) => c.fn === 'bot_canal_plataforma'));
});

caso('canal de teste com #central não procura pet shop nem envia pela Evolution', () => {
  const r = rodar({ ...ev('ACHEI K7M3QX'), canal: 'teste', central: true }, base({
    bot_achado_registrar: { resultado: 'limite' },
  }));
  assert.ok(!r.chamadas.some((c) => c.fn === 'bot_petshop_teste' || c.fn === 'bot_envio_plataforma'));
  assert.strictEqual(r.fim.envios[0].canal, 'teste');
});

console.log(`\n${n} casos OK`);
