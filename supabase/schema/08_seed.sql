-- =====================================================================
-- PetCare Hub · 08 · Seed
-- Parte A (catálogo): vale para produção.
-- Parte B (dados de teste): dois pet shops fictícios para testar agenda,
-- capacidade, isolamento entre clientes e compartilhamento com consentimento.
-- Apague a parte B antes de cadastrar o pet shop real da POC
-- (ou rode o bloco "LIMPAR DADOS DE TESTE" no fim do guia).
-- UUIDs fixos para os testes acharem os registros.
-- =====================================================================
begin;

-- ============================ PARTE A ===============================
insert into public.planos (codigo, nome, preco_mensal, limite_profissionais, limite_agendamentos_mes, plaquinhas_incluidas, ativo, ordem) values
  ('starter', 'Essencial',     197.00, 1,    80,   1, true,  1),
  ('pro',     'Profissional',  397.00, 3,    null, 3, true,  2),
  ('daycare', 'Day Care',      597.00, 3,    null, 3, false, 3),   -- previsto; preço sugerido
  ('clinic',  'Clinic',        697.00, null, null, 5, false, 4);   -- previsto

insert into public.modulos (codigo, nome, fase) values
  ('spa',           'Spa',            'MVP'),
  ('administracao', 'Administração',  'F2'),
  ('daycare',       'Day Care',       'F3'),
  ('vet',           'Vet',            'F3'),
  ('loja',          'Loja',           'F4');

insert into public.funcionalidades (codigo, modulo_codigo, nome, fase, vendavel_avulsa) values
  ('spa.agenda',                 'spa', 'Agenda e motor de disponibilidade',      'MVP', false),
  ('spa.bot',                    'spa', 'Bot no WhatsApp (menu)',                 'MVP', false),
  ('spa.lembretes',              'spa', 'Confirmação e lembrete 24h',             'MVP', false),
  ('spa.operacao_dia',           'spa', 'Check-in e check-out',                   'MVP', false),
  ('spa.pagamentos',             'spa', 'Registro de pagamento',                  'MVP', false),
  ('spa.relatorios',             'spa', 'Relatórios básicos',                     'MVP', false),
  ('spa.pagina_publica',         'spa', 'Ficha pública do pet (QR)',              'MVP', false),
  ('spa.agenda_capacidade',      'spa', 'Até X pets por profissional/horário',    'F2',  true),
  ('spa.equipe',                 'spa', 'Perfis de equipe',                       'F2',  false),
  ('spa.comissao',               'spa', 'Comissão',                               'F2',  false),
  ('spa.pacotes',                'spa', 'Pacotes de banho',                       'F2',  true),
  ('spa.taxi_dog',               'spa', 'Táxi dog',                               'F2',  true),
  ('spa.reativacao',             'spa', 'Reativação e retorno',                   'F2',  true),
  ('spa.bot_linguagem_natural',  'spa', 'Bot com linguagem natural (Claude API)', 'F2',  true),
  ('administracao.caixa',            'administracao', 'Caixa',                     'F2', false),
  ('administracao.contas_receber',   'administracao', 'Contas a receber',          'F2', false),
  ('administracao.almoxarifado',     'administracao', 'Requisição de insumos',     'F2', true),
  ('administracao.estoque',          'administracao', 'Estoque',                   'F2', true),
  ('administracao.compras',          'administracao', 'Compras',                   'F2', true),
  ('administracao.custo_servico',    'administracao', 'Custo do serviço e margem', 'F2', true),
  ('administracao.compras_automaticas','administracao','Compras automáticas',      'F3', true),
  ('daycare.hotel',  'daycare', 'Hotel pet',            'F3', false),
  ('daycare.creche', 'daycare', 'Creche',               'F3', false),
  ('vet.prontuario', 'vet',     'Prontuário',           'F3', false),
  ('vet.vacinas',    'vet',     'Vacinas aplicadas',    'F3', false),
  ('loja.pdv',       'loja',    'PDV',                  'F4', false),
  ('loja.fiscal',    'loja',    'NF-e / NFC-e',         'F4', false);

-- Essencial: Spa básico + caixa e contas a receber
insert into public.plano_funcionalidades (plano_codigo, funcionalidade_codigo)
select 'starter', unnest(array['spa.agenda','spa.bot','spa.lembretes','spa.operacao_dia','spa.pagamentos',
                               'spa.relatorios','spa.pagina_publica','administracao.caixa','administracao.contas_receber']);
-- Profissional: Spa completo + Administração (linguagem natural fica como add-on)
insert into public.plano_funcionalidades (plano_codigo, funcionalidade_codigo)
select 'pro', codigo from public.funcionalidades
 where modulo_codigo in ('spa','administracao')
   and codigo not in ('spa.bot_linguagem_natural','administracao.compras_automaticas');
-- Day Care e Clinic: Profissional + módulo próprio + recursos de plano superior
insert into public.plano_funcionalidades (plano_codigo, funcionalidade_codigo)
select p.plano, f.codigo
  from (values ('daycare','daycare'), ('clinic','vet')) p(plano, modulo)
  join public.funcionalidades f on f.modulo_codigo in ('spa','administracao', p.modulo);

-- ============================ PARTE B ===============================
do $$
declare
  pf  uuid := '11111111-1111-4111-8111-111111111111';   -- Pet Feliz (simula a POC)
  pr  uuid := '22222222-2222-4222-8222-222222222222';   -- Pet Rival (outro cliente do Hub)
  ana uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  bru uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  riv uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  s_banho uuid := 'b0000000-0000-4000-8000-000000000001';
  s_tosa  uuid := 'b0000000-0000-4000-8000-000000000002';
  s_bt    uuid := 'b0000000-0000-4000-8000-000000000003';
  s_hid   uuid := 'b0000000-0000-4000-8000-000000000004';
  s_rban  uuid := 'b0000000-0000-4000-8000-000000000011';
  s_rvac  uuid := 'b0000000-0000-4000-8000-000000000012';
  t_carla uuid := 'c0000000-0000-4000-8000-000000000001';
  t_diego uuid := 'c0000000-0000-4000-8000-000000000002';
  t_elisa uuid := 'c0000000-0000-4000-8000-000000000003';
  p_thor  uuid := 'd0000000-0000-4000-8000-000000000001';
  p_mel   uuid := 'd0000000-0000-4000-8000-000000000002';
  p_nina  uuid := 'd0000000-0000-4000-8000-000000000003';
  p_bob   uuid := 'd0000000-0000-4000-8000-000000000004';
  d       date;   -- próximo dia útil (seg–sex) a partir de amanhã, no fuso de SP
  f       date;   -- feriado de teste
  tz      text := 'America/Sao_Paulo';
begin
  d := (now() at time zone tz)::date + 1;
  while extract(dow from d) in (0, 6) loop d := d + 1; end loop;
  f := d + 7;
  while extract(dow from f) in (0, 6) loop f := f + 1; end loop;

  -- Pet shops
  insert into public.petshops (id, nome, slug, telefone_wp, plano_codigo, modo_capacidade, intervalo_slot_min) values
    (pf, 'Pet Feliz (TESTE)', 'pet-feliz-teste', '+5519900000001', 'pro',     'multiplo', 30),
    (pr, 'Pet Rival (TESTE)', 'pet-rival-teste', '+5519900000002', 'starter', 'simples',  30);

  insert into public.bot_config (petshop_id, nome_bot, saudacao, ativo) values
    (pf, 'Luna', 'Oi, eu sou a Luna, assistente do Pet Feliz! 🐾', false),
    (pr, 'Max',  'Olá! Aqui é o Max, do Pet Rival.', false);

  insert into public.harpia_contratos (petshop_id, setup_tipo, setup_valor, desconto_percentual, desconto_motivo) values
    (pf, 'padrao', 0, 100, 'POC: permuta (gratuidade extensível); depois 30% vitalício no Profissional');

  insert into public.petshop_custos_config (petshop_id) values (pf), (pr);

  -- Horário: seg–sex 08–12 e 13–18; sábado 08–13
  insert into public.horarios_funcionamento (petshop_id, dia_semana, abre, fecha)
  select ps, dia, h.abre, h.fecha
    from unnest(array[pf, pr]) ps
    cross join generate_series(1, 5) dia
    cross join (values ('08:00'::time, '12:00'::time), ('13:00', '18:00')) h(abre, fecha);
  insert into public.horarios_funcionamento (petshop_id, dia_semana, abre, fecha)
  select ps, 6, '08:00', '13:00' from unnest(array[pf, pr]) ps;

  -- Recursos: Ana (2 pets ao mesmo tempo, 30 min entre entradas) e Bruno (1 pet, só banho)
  insert into public.recursos (id, petshop_id, nome, capacidade, intervalo_entrada_min, ordem) values
    (ana, pf, 'Ana',   2, 30, 1),
    (bru, pf, 'Bruno', 1, 0,  2),
    (riv, pr, 'Rita',  1, 0,  1);

  -- Serviços (preços do seed do documento-mestre; DURAÇÕES são suposição: ajustar com o pet shop)
  insert into public.servicos (id, petshop_id, nome, tipo, adicional, ordem) values
    (s_banho, pf, 'Banho',        'estetica', false, 1),
    (s_tosa,  pf, 'Tosa',         'estetica', false, 2),
    (s_bt,    pf, 'Banho e tosa', 'estetica', false, 3),
    (s_hid,   pf, 'Hidratação',   'estetica', true,  4),
    (s_rban,  pr, 'Banho',        'estetica', false, 1),
    (s_rvac,  pr, 'Vacina V10',   'vacina',   false, 2);

  insert into public.servico_precos (servico_id, petshop_id, porte, preco, duracao_min) values
    (s_banho, pf, 'P', 35, 45), (s_banho, pf, 'M', 45, 60), (s_banho, pf, 'G', 60, 75),  (s_banho, pf, 'GG', 80, 90),
    (s_tosa,  pf, 'P', 40, 60), (s_tosa,  pf, 'M', 55, 75), (s_tosa,  pf, 'G', 70, 90),  (s_tosa,  pf, 'GG', 90, 120),
    (s_bt,    pf, 'P', 65, 90), (s_bt,    pf, 'M', 85, 105),(s_bt,    pf, 'G', 110, 120),(s_bt,    pf, 'GG', 145, 150),
    (s_hid,   pf, 'P', 25, 15), (s_hid,   pf, 'M', 35, 20), (s_hid,   pf, 'G', 45, 25),  (s_hid,   pf, 'GG', 60, 30),
    (s_rban,  pr, 'P', 40, 45), (s_rban,  pr, 'M', 50, 60), (s_rban,  pr, 'G', 65, 75),  (s_rban,  pr, 'GG', 85, 90),
    (s_rvac,  pr, 'P', 90, 15), (s_rvac,  pr, 'M', 90, 15), (s_rvac,  pr, 'G', 90, 15),  (s_rvac,  pr, 'GG', 90, 15);

  -- Bruno só faz banho e hidratação. Ana não tem linhas = faz tudo.
  insert into public.recurso_servicos (recurso_id, servico_id, petshop_id) values
    (bru, s_banho, pf), (bru, s_hid, pf);

  insert into public.bloqueios (petshop_id, tipo, inicio, fim, motivo) values
    (pf, 'feriado', (f::timestamp) at time zone tz, ((f + 1)::timestamp) at time zone tz, 'Feriado de teste');

  -- Tutores globais (só telefone) e vínculos
  insert into public.tutores (id, telefone) values
    (t_carla, '+5519988887777'), (t_diego, '+5519977776666'), (t_elisa, '+5519966665555');
  insert into public.tutor_petshop (tutor_id, petshop_id, nome, origem) values
    (t_carla, pf, 'Carla Souza', 'manual'),
    (t_diego, pf, 'Diego Lima',  'bot'),
    (t_elisa, pr, 'Elisa Prado', 'bot');        -- Elisa só é cliente do Pet Rival

  insert into public.pets (id, tutor_id, nome, especie, raca, porte, pelagem, alergias, criado_por_petshop_id, ficha_publica) values
    (p_thor, t_carla, 'Thor', 'cao', 'Golden Retriever', 'G',  'longa', null, pf,
       '{"ativa": true, "campos": ["nome","especie","raca","contato"]}'),
    (p_mel,  t_carla, 'Mel',  'cao', 'Shih-tzu',         'P',  'longa', null, pf, default),
    (p_nina, t_diego, 'Nina', 'cao', 'SRD',              'M',  'curta', null, pf, default),
    (p_bob,  t_elisa, 'Bob',  'cao', 'Bernese',          'GG', 'dupla', 'Frango', pr, default);
  insert into public.pet_petshop (pet_id, petshop_id, temperamento) values
    (p_thor, pf, 'Dócil'), (p_mel, pf, 'Medrosa com secador'), (p_nina, pf, null), (p_bob, pr, 'Agitado');

  -- Elisa autorizou compartilhar (no bot do Pet Rival). Termo fictício v0.
  insert into public.consentimentos (tutor_id, escopo, versao_termo, canal, petshop_origem_id) values
    (t_elisa, 'compartilhar_dados_pet', 'v0-teste', 'bot', pr),
    (t_elisa, 'compartilhar_saude',     'v0-teste', 'bot', pr);

  -- Linha do tempo do Bob no Pet Rival: uma vacina (compartilhável) e um banho (sempre privado)
  insert into public.pet_eventos (pet_id, petshop_id, tipo, visibilidade, ocorrido_em, titulo, dados) values
    (p_bob, pr, 'vacina',   'compartilhavel', now() - interval '20 days', 'Vacina V10', '{"vacina":"V10","validade":"2027-10-01"}'),
    (p_bob, pr, 'estetica', 'privado',        now() - interval '10 days', 'Banho',      '{"valor_total":85}');

  insert into public.plaquinhas (pet_id, petshop_id, kit, material, codigo, entregue_em) values
    (p_thor, pf, 'essencial', 'Acrílico azul 3 mm', 'THOR2026AB', current_date);

  -- Agenda do próximo dia útil no Pet Feliz (modo múltiplo: Ana com 2 pets escalonados)
  perform public.reservar_agendamento(pf, p_thor, t_carla, array[s_bt, s_hid], ((d + time '09:00') at time zone tz), ana, 'manual');
  perform public.reservar_agendamento(pf, p_mel,  t_carla, array[s_banho],     ((d + time '09:30') at time zone tz), ana, 'bot');
  perform public.reservar_agendamento(pf, p_nina, t_diego, array[s_banho],     ((d + time '09:00') at time zone tz), bru, 'bot');

  raise notice 'Seed de teste criado. Agenda em % (feriado de teste em %).', d, f;
end $$;

commit;
