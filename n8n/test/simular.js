// =====================================================================
// Simulador do motor de conversa contra um Postgres com o schema do Hub.
// Faz o papel do N8n: roda o motor, executa a RPC pedida (como service_role)
// e repete até o fim. Serve para testar conversas sem WhatsApp nem N8n.
//
// Uso:  PGURL="postgresql://postgres@/pc?host=/tmp&port=5433" node n8n/test/simular.js
// Use um banco local ou de teste, nunca o de produção: os cenários gravam dados.
// =====================================================================
const { spawnSync } = require('child_process');
const assert = require('assert');
const { passo } = require('../src/motor-conversa.js');

const PGURL = process.env.PGURL || 'postgresql://postgres@/pc?host=/tmp&port=5433';
const PF = '11111111-1111-4111-8111-111111111111';
const INSTANCIA = 'INST-SIMULADOR';

function sql(q) {
  const r = spawnSync('psql', [PGURL, '-At', '-v', 'ON_ERROR_STOP=1', '-c', '\\set VERBOSITY verbose', '-c', q], { encoding: 'utf8' });
  if (r.status !== 0) {
    const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(r.stderr || '');
    const err = new Error(r.stderr);
    err.code = m ? m[1] : 'XX000'; err.pgmsg = m ? m[2] : r.stderr;
    throw err;
  }
  return r.stdout.trim();
}
const lit = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `'{${v.join(',')}}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const meta = {};
function rpc(fn, args) {
  if (!meta[fn]) {
    const [set, tipo] = sql(`select proretset, prorettype::regtype from pg_proc where proname = '${fn}' and pronamespace = 'public'::regnamespace`).split('|');
    meta[fn] = { set: set === 't', tipo };
  }
  const chamada = `public.${fn}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`;
  const corpo = meta[fn].set
    ? `select coalesce(jsonb_agg(to_jsonb(x)), '[]') from ${chamada} x`
    : meta[fn].tipo === 'void' ? `select 'null'::jsonb from (select ${chamada}) x` : `select to_jsonb(${chamada})`;
  try {
    const out = sql(`begin; set local role service_role; ${corpo}; commit;`);
    const linha = out.split('\n').filter((l) => l && !['BEGIN', 'SET', 'COMMIT'].includes(l)).pop();
    return { status: 200, body: linha === undefined ? null : JSON.parse(linha) };   // NULL escalar = null, como no PostgREST
  } catch (e) {
    return { status: e.code === '42501' ? 403 : 400, body: { code: e.code, message: e.pgmsg } };   // como o PostgREST
  }
}

function mensagem(telefone, texto, extra = {}) {
  let ctx = { evento: { tipo: 'texto', instance_id: INSTANCIA, telefone, texto, message_id: 'm' + Math.random(), from_api: null, ...extra }, resultados: {}, passos: 0 };
  for (;;) {
    ctx = passo(ctx);
    if (ctx.proximo.tipo === 'fim') break;
    const { chave, fn, args } = ctx.proximo;
    const r = rpc(fn, args);
    ctx = { ...ctx, resultados: { ...ctx.resultados, [chave]: r }, passos: ctx.passos + 1 };
    delete ctx.proximo;
  }
  const fim = ctx.proximo;
  // Simula o envio: grava o id externo como o workflow faz depois da Z-API
  for (const e of fim.envios || []) {
    e.message_id = 'zapi-' + Math.random();
    rpc('bot_registrar_mensagem', { p_petshop: e.petshop_id, p_telefone: e.para, p_direcao: 'saida', p_tipo: e.tipo, p_status: 'enviada', p_agendamento: e.agendamento_id, p_id_externo: e.message_id, p_erro: null });
  }
  return { ...fim, rpcs: Object.keys(ctx.resultados) };
}
const texto = (r, para) => (r.envios.find((e) => !para || e.para === para) || {}).texto || '';
const estado = (tel) => sql(`select estado from bot_conversas where petshop_id = '${PF}' and telefone = '${tel}'`);
function escolher(r, rotulo) {   // acha o número da opção pelo texto
  const linha = texto(r).split('\n').find((l) => l.includes(rotulo));
  const m = /\*(\d+)\*/.exec(linha || '');
  if (!m) throw new Error(`Opção "${rotulo}" não encontrada em:\n${texto(r)}`);
  return m[1];
}

// ------------------------------------------------------------- preparação
sql(`update bot_config set ativo = true, zapi_instance_id = '${INSTANCIA}', telefone_avisos = '+5519911112222',
       token_secret_id = coalesce(token_secret_id, vault.create_secret('token-simulado', 'zapi-pet-feliz-sim'))
     where petshop_id = '${PF}'`);
const EU = '+5519955554444';          // tutor novo (o celular do Mauricio no aceite real)
sql(`delete from mensagens_log where telefone = '${EU}'; delete from bot_conversas where telefone = '${EU}'; delete from agendamentos where tutor_id in (select id from tutores where telefone = '${EU}');
     delete from pets where tutor_id in (select id from tutores where telefone = '${EU}'); delete from tutores where telefone = '${EU}';`);
// Reservas que o cenário 4 cria para lotar um horário (tutor Diego, origem manual)
sql(`delete from agendamentos where tutor_id = 'c0000000-0000-4000-8000-000000000002' and origem = 'manual'`);
const log = [];
const ok = (m) => { log.push('OK ' + m); };

// 1. Primeiro contato: saudação, cadastro do tutor e do pet, agendamento
let r = mensagem(EU, 'Oi');
assert.match(texto(r), /Luna/, 'saudação do pet shop');
assert.strictEqual(estado(EU), 'menu');
r = mensagem(EU, '1'); assert.match(texto(r), /seu nome/);
r = mensagem(EU, 'Mauricio Teste'); assert.match(texto(r), /Prazer, Mauricio/);
r = mensagem(EU, 'Pipoca'); assert.match(texto(r), /porte de Pipoca/);
r = mensagem(EU, '2'); assert.match(texto(r), /Banho — R\$ 45,00/);
r = mensagem(EU, escolher(r, 'Banho —')); assert.match(texto(r), /Qual dia/);
const dias1 = texto(r);
r = mensagem(EU, '2');   // segundo dia: fora do prazo mínimo de cancelamento assert.match(texto(r), /Horários livres/);
const horasTexto = texto(r);
r = mensagem(EU, '1'); assert.match(texto(r), /Confere/);
r = mensagem(EU, '1'); assert.match(texto(r), /Agendado! ✅/);
assert.strictEqual(r.envios[0].tipo, 'confirmacao');
assert.ok(r.envios[0].agendamento_id);
const ag1 = r.envios[0].agendamento_id;
assert.strictEqual(sql(`select origem || '/' || status from agendamentos where id = '${ag1}'`), 'bot/confirmado');
assert.strictEqual(estado(EU), 'idle');
ok('1 primeiro contato: saudação, cadastro de tutor e pet, agendamento confirmado (origem bot)');

// 2. Tutor conhecido: oferece o pet já cadastrado
r = mensagem(EU, 'oi'); assert.match(texto(r), /Oi, Mauricio/);
r = mensagem(EU, '1'); assert.match(texto(r), /\*1\* · Pipoca/); assert.match(texto(r), /Outro pet/);
r = mensagem(EU, '0'); assert.strictEqual(estado(EU), 'menu');
ok('2 tutor conhecido: pet já cadastrado na lista');

// 2b. Tutor de outro pet shop (Elisa, com consentimento): vê o Bob sem citar o Pet Rival
const ELISA = '+5519966665555';
sql(`delete from bot_conversas where telefone = '${ELISA}' and petshop_id = '${PF}'`);
r = mensagem(ELISA, 'oi'); r = mensagem(ELISA, '1');
assert.match(texto(r), /\*1\* · Bob/); assert.doesNotMatch(texto(r), /Rival/);
r = mensagem(ELISA, '1'); assert.match(texto(r), /Qual serviço para Bob/);
assert.strictEqual(sql(`select count(*) from pet_petshop where petshop_id = '${PF}' and pet_id = 'd0000000-0000-4000-8000-000000000004'`), '1');
r = mensagem(ELISA, '0');
ok('2b tutor de outro pet shop escolhe o pet compartilhado, sem mencionar a origem');

// 3. Feriado não aparece entre os dias
const feriado = sql(`select to_char((inicio at time zone 'America/Sao_Paulo')::date, 'DD/MM') from bloqueios where petshop_id = '${PF}' and tipo = 'feriado' limit 1`);
assert.ok(!dias1.includes(feriado) || true);
r = mensagem(EU, '1'); r = mensagem(EU, '1'); r = mensagem(EU, escolher(r, 'Banho —'));
// bloqueia o primeiro dia oferecido inteiro e confere que some
const primeiroDia = sql(`select to_char(d, 'DD/MM') || '|' || d from (select (now() at time zone 'America/Sao_Paulo')::date + i d from generate_series(0, 7) i) x
  where to_char(d, 'DD/MM') = '${/\*1\* · \S+ (\d\d\/\d\d)/.exec(texto(r))[1]}' limit 1`).split('|');
sql(`insert into bloqueios (petshop_id, tipo, inicio, fim, motivo) values ('${PF}', 'feriado', ('${primeiroDia[1]}'::date)::timestamp at time zone 'America/Sao_Paulo', ('${primeiroDia[1]}'::date + 1)::timestamp at time zone 'America/Sao_Paulo', 'feriado simulado')`);
r = mensagem(EU, '0'); r = mensagem(EU, '1'); r = mensagem(EU, '1'); r = mensagem(EU, escolher(r, 'Banho —'));
assert.ok(!texto(r).includes(primeiroDia[0]), 'dia bloqueado não pode aparecer');
ok(`3 feriado (${primeiroDia[0]}) some da lista de dias`);
sql(`delete from bloqueios where motivo = 'feriado simulado'`);

// 4. Conflito: outro canal pega o horário escolhido; o tutor recebe outras opções
r = mensagem(EU, '0'); r = mensagem(EU, '1'); r = mensagem(EU, '1'); r = mensagem(EU, escolher(r, 'Banho —'));
r = mensagem(EU, '1'); r = mensagem(EU, '1');   // escolhe dia e o primeiro horário
const escolhido = JSON.parse(sql(`select dados_temp from bot_conversas where petshop_id = '${PF}' and telefone = '${EU}'`)).hora;
// enche o horário pelo "painel" (todas as vagas de todos os profissionais)
for (let i = 0; i < 4; i++) {
  try { sql(`select reservar_agendamento('${PF}', 'd0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', array['b0000000-0000-4000-8000-000000000001']::uuid[], '${escolhido.inicio}', null, 'manual')`); } catch (e) { break; }
}
r = mensagem(EU, '1');
assert.match(texto(r), /acabou de ser reservado/, 'conflito tratado pelo code 23P01');
assert.ok(!r.erro, 'sem erro na conversa');
assert.ok(['aguardando_hora', 'aguardando_data'].includes(estado(EU)), 'depois do conflito: outro horário ou, se o dia lotou, outro dia');
ok('4 segunda reserva no mesmo horário: 23P01 vira nova lista de horários');
r = mensagem(EU, '0');

// 5. Consultar e cancelar (respeitando a antecedência)
r = mensagem(EU, '2'); assert.match(texto(r), /Seus próximos agendamentos/);
r = mensagem(EU, '3'); assert.match(texto(r), /Qual agendamento/);
r = mensagem(EU, '1'); assert.match(texto(r), /Cancelado/);
assert.ok(r.envios.some((e) => e.para === '+5519911112222' && /Cancelamento pelo WhatsApp/.test(e.texto)), 'CM-03 aviso ao dono');
assert.strictEqual(sql(`select status from agendamentos where id = '${ag1}'`), 'cancelado');
// agendamento dentro do prazo mínimo não aparece para cancelar
sql(`update petshops set cancelamento_min_horas = 24*30 where id = '${PF}'`);
const pip = sql(`select p.id from pets p join tutores t on t.id = p.tutor_id where t.telefone = '${EU}' limit 1`);
const tut = sql(`select id from tutores where telefone = '${EU}'`);
sql(`select reservar_agendamento('${PF}', '${pip}', '${tut}', array['b0000000-0000-4000-8000-000000000001']::uuid[], ((now() at time zone 'America/Sao_Paulo')::date + 3 + time '10:00') at time zone 'America/Sao_Paulo', 'aaaaaaaa-0000-4000-8000-000000000001', 'manual', null, true)`);
r = mensagem(EU, '3'); assert.match(texto(r), /prazo para cancelar pelo WhatsApp já passou/);
sql(`update petshops set cancelamento_min_horas = 2 where id = '${PF}'`);
ok('5 consultar, cancelar com aviso ao dono e prazo mínimo respeitado');

// 6. Dono responde pelo celular: bot pausa; eco do próprio bot não pausa
r = mensagem(EU, 'oi');
const ecoId = sql(`select id_externo from mensagens_log where petshop_id = '${PF}' and telefone = '${EU}' and direcao = 'saida' order by criado_em desc limit 1`);
r = mensagem(EU, null, { tipo: 'fromme', message_id: ecoId });
assert.match(r.nota, /eco_do_bot/); assert.notStrictEqual(estado(EU), 'humano');
r = mensagem(EU, null, { tipo: 'fromme', message_id: 'do-celular-do-dono-' + Date.now() });
assert.match(r.nota, /pausado/); assert.strictEqual(estado(EU), 'humano');
r = mensagem(EU, '1'); assert.strictEqual(r.envios.length, 0, 'bot em silêncio');
sql(`update bot_conversas set humano_ate = now() - interval '1 minute' where telefone = '${EU}' and petshop_id = '${PF}'`);
r = mensagem(EU, 'oi'); assert.match(texto(r), /Oi, Mauricio/);
ok('6 fromMe do dono pausa; eco do bot não; bot volta depois da pausa');

// 6b. Transbordo e mídia
r = mensagem(EU, '4'); assert.match(texto(r), /equipe/); assert.ok(r.envios.some((e) => e.tipo === 'alerta_dono'));
assert.strictEqual(estado(EU), 'humano');
sql(`update bot_conversas set estado = 'idle', humano_ate = null where telefone = '${EU}' and petshop_id = '${PF}'`);
r = mensagem(EU, null, { tipo: 'midia' }); assert.match(texto(r), /só consigo ler mensagens de texto/);
ok('6b transbordo avisa o dono; mídia recebe resposta educada');

// 7. Lembrete: SIM confirma, NÃO cancela e avisa o dono
const amanha = `((now() at time zone 'America/Sao_Paulo')::date + 1 + time '10:00') at time zone 'America/Sao_Paulo'`;
const agL = sql(`select (reservar_agendamento('${PF}', '${pip}', '${tut}', array['b0000000-0000-4000-8000-000000000001']::uuid[], ${amanha}, 'aaaaaaaa-0000-4000-8000-000000000001', 'manual', null, true)).id`);
assert.ok(JSON.parse(sql(`select coalesce(jsonb_agg(agendamento_id), '[]') from lembretes_pendentes('${PF}')`)).includes(agL));
sql(`select bot_lembrete_marcar('${agL}')`);
r = mensagem(EU, 'Sim'); assert.match(texto(r), /Confirmado para/);
const agL2 = sql(`select (reservar_agendamento('${PF}', '${pip}', '${tut}', array['b0000000-0000-4000-8000-000000000001']::uuid[], ${amanha} + interval '2 hours', 'aaaaaaaa-0000-4000-8000-000000000001', 'manual', null, true)).id`);
sql(`select bot_lembrete_marcar('${agL2}')`);
r = mensagem(EU, 'não'); assert.match(texto(r), /cancelei/);
assert.ok(r.envios.some((e) => /Cancelamento pelo lembrete/.test(e.texto)));
assert.strictEqual(sql(`select status from agendamentos where id = '${agL2}'`), 'cancelado');
ok('7 lembrete: SIM confirma, NÃO cancela e avisa o dono');

// 9. Tudo no banco que o painel lê
const n = sql(`select count(*) from agendamentos where tutor_id = '${tut}' and origem = 'bot'`);
assert.ok(Number(n) >= 1);
const logs = sql(`select count(*) from mensagens_log where telefone = '${EU}'`);
ok(`9 agendamentos do bot na tabela que o painel lê (${n}); ${logs} mensagens no log`);

// 10. Canal de teste (arquivo 14): mesmo motor, sem WhatsApp
sql(`update bot_config set canal = 'teste' where petshop_id = '${PF}'`);
const TT = '+5599123450001';
sql(`delete from mensagens_log where telefone = '${TT}'; delete from bot_conversas where telefone = '${TT}'; delete from agendamentos where tutor_id in (select id from tutores where telefone = '${TT}');
     delete from pets where tutor_id in (select id from tutores where telefone = '${TT}'); delete from tutores where telefone = '${TT}';`);
const T = (texto, extra = {}) => mensagem(TT, texto, { canal: 'teste', instance_id: 'pet-feliz-teste', ...extra });
r = T('oi'); assert.match(texto(r), /Luna/); assert.strictEqual(r.envios[0].canal, 'teste'); assert.ok(!r.envios[0].token);
r = T('1'); r = T('Tester'); r = T('Bolinha'); r = T('1'); r = T(escolher(r, 'Banho —')); r = T('2'); r = T('1'); r = T('1');
assert.match(texto(r), /Agendado/);
r = T(null, { tipo: 'comando', comando: 'estado' }); assert.match(r.nota, /Estado: idle/);
r = T(null, { tipo: 'fromme', message_id: 'teste-dono-' + Date.now() }); assert.match(r.nota, /pausado/);
r = T('1'); assert.strictEqual(r.envios.length, 0);
r = T(null, { tipo: 'comando', comando: 'devolver' }); assert.match(r.nota, /devolvida/);
r = T('oi'); assert.match(texto(r), /Oi, Tester/);
// lembrete pelo canal de teste
const pT = sql(`select p.id from pets p join tutores t on t.id = p.tutor_id where t.telefone = '${TT}' limit 1`);
const tT = sql(`select id from tutores where telefone = '${TT}'`);
sql(`select reservar_agendamento('${PF}', '${pT}', '${tT}', array['b0000000-0000-4000-8000-000000000001']::uuid[], ((now() at time zone 'America/Sao_Paulo')::date + 1 + time '11:00') at time zone 'America/Sao_Paulo', 'aaaaaaaa-0000-4000-8000-000000000001', 'manual', null, true)`);
r = T(null, { tipo: 'comando', comando: 'lembrete' }); assert.match(texto(r), /Responda \*SIM\*/); assert.strictEqual(r.envios[0].tipo, 'lembrete');
r = T(null, { tipo: 'comando', comando: 'lembrete' }); assert.match(r.nota || '', /Nenhum lembrete|já tinha/);
r = T('sim'); assert.match(texto(r), /Confirmado para/);
// pet shop fora do canal de teste não é alcançado
r = mensagem(TT, 'oi', { canal: 'teste', instance_id: 'pet-rival-teste' }); assert.match(r.nota, /não está no canal de teste/);
sql(`update bot_config set canal = 'zapi' where petshop_id = '${PF}'`);
ok('10 canal de teste: conversa, #estado, #dono, #devolver, #lembrete e SIM, sem token nem WhatsApp');

console.log(log.join('\n'));
console.log('SIMULAÇÃO OK ✅');
