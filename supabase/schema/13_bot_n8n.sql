-- =====================================================================
-- PetCare Hub · 13 · Bot no N8n (etapa 5)
-- Complementa o 05 com o que o workflow precisa para não tocar em tabela:
--   1. estados novos da conversa (nome do tutor, nome do pet, serviço)
--   2. bot_config.telefone_avisos e controle de alerta de conexão
--   3. fluxo_erros (PL-04)
--   4. bot_servicos            → lista de serviços para o porte (BT-03)
--   5. bot_envio               → instância, token (Vault) e telefone de avisos
--   6. bot_aberto_agora        → BT-12 (horário + bloqueio do pet shop inteiro)
--   7. bot_registrar_mensagem  → CM-11 (metadados, sem texto: LGPD)
--   8. bot_registrar_fromme    → BT-18 sem confundir eco do próprio bot com o dono
--   9. lembretes_pendentes     → agora ignora bot desligado, bloqueio e CM-10
--  10. bot_lembrete_marcar / bot_responder_lembrete → CM-02 e CM-03
--  11. bot_agendamentos_em_bloqueio → aviso ao dono
--  12. bot_instancias_monitoradas / bot_conexao_evento → PL-03
--  13. bot_registrar_erro     → PL-04
-- Tudo SECURITY DEFINER e executável só pelo service_role (secret key do N8n).
-- Rode depois do 12. Pode rodar de novo: é idempotente.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Estados novos. Antes, nome do tutor e do pet não tinham estado
--    próprio e o fluxo teria de esconder subetapas dentro de dados_temp.
-- ---------------------------------------------------------------------
alter table public.bot_conversas drop constraint if exists bot_conversas_estado_check;
alter table public.bot_conversas add constraint bot_conversas_estado_check check (estado in (
  'novo','idle','menu',
  'aguardando_nome','aguardando_pet','aguardando_nome_pet','aguardando_porte','aguardando_servico',
  'aguardando_data','aguardando_hora','aguardando_confirmacao','aguardando_cancelamento',
  'humano','bloqueado'));

-- Mensagem que o dono mandou pelo celular entra no log como 'humano'.
alter table public.mensagens_log drop constraint if exists mensagens_log_tipo_check;
alter table public.mensagens_log add constraint mensagens_log_tipo_check check (tipo in (
  'conversa','confirmacao','lembrete','cancelamento','reativacao','pet_pronto',
  'transbordo','alerta_dono','humano','outro'));
create index if not exists mensagens_log_externo_idx on public.mensagens_log (petshop_id, id_externo)
  where id_externo is not null;

-- ---------------------------------------------------------------------
-- 2. Avisos ao dono e alerta de conexão
--    telefone_avisos: celular pessoal do dono. Precisa ser diferente do
--    número do bot: mandar para o próprio número não notifica ninguém.
-- ---------------------------------------------------------------------
alter table public.bot_config add column if not exists telefone_avisos text
  check (telefone_avisos ~ '^\+[1-9][0-9]{7,14}$');
alter table public.bot_config add column if not exists conexao_alertado_em timestamptz;

-- ---------------------------------------------------------------------
-- 3. Log de erros dos fluxos (PL-04). Só a Harpia lê.
-- ---------------------------------------------------------------------
create table if not exists public.fluxo_erros (
  id            uuid primary key default gen_random_uuid(),
  petshop_id    uuid references public.petshops(id) on delete set null,
  workflow      text not null,
  no            text,
  mensagem      text not null,
  execucao_id   text,
  url_execucao  text,
  criado_em     timestamptz not null default now()
);
create index if not exists fluxo_erros_idx on public.fluxo_erros (criado_em desc);
alter table public.fluxo_erros enable row level security;
drop policy if exists fluxo_erros_ler on public.fluxo_erros;
create policy fluxo_erros_ler on public.fluxo_erros for select to authenticated
  using ((select private.eh_super_admin()));
revoke all on public.fluxo_erros from anon;

-- ---------------------------------------------------------------------
-- 4. Serviços oferecidos pelo bot para um porte (BT-03).
--    Só estética, ativos, não adicionais, marcados disponivel_bot e com
--    preço/duração para o porte (o motor recusaria os outros).
-- ---------------------------------------------------------------------
create or replace function public.bot_servicos(p_petshop uuid, p_porte text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'nome', s.nome, 'preco', sp.preco, 'duracao_min', sp.duracao_min)
         order by s.ordem, s.nome), '[]')
    from public.servicos s
    join public.servico_precos sp on sp.servico_id = s.id and sp.porte = p_porte
   where s.petshop_id = p_petshop and s.ativo and s.disponivel_bot
     and not s.adicional and s.tipo = 'estetica';
$$;

-- ---------------------------------------------------------------------
-- 5. Dados de envio do pet shop numa chamada só.
-- ---------------------------------------------------------------------
create or replace function public.bot_envio(p_petshop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'canal', bc.canal,
           'zapi_instance_id', bc.zapi_instance_id,
           'token', ds.decrypted_secret,
           'telefone_avisos', bc.telefone_avisos,
           'conexao_status', bc.conexao_status,
           'ativo', bc.ativo)
    from public.bot_config bc
    left join vault.decrypted_secrets ds on ds.id = bc.token_secret_id
   where bc.petshop_id = p_petshop;
$$;

-- ---------------------------------------------------------------------
-- 6. Aberto agora? E quando abre de novo? (BT-12)
--    Considera horário de funcionamento e bloqueio do pet shop inteiro
--    (feriado). Folga de um profissional não fecha a loja.
-- ---------------------------------------------------------------------
create or replace function public.bot_aberto_agora(p_petshop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso   text;
  v_agora  timestamptz := now();
  v_hoje   date;
  v_dia    date;
  v_ini    timestamptz;
  v_fim    timestamptz;
  v_bfim   timestamptz;
  v_prox   timestamptz;
  r        record;
  v_dias   text[] := array['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  v_txt    text;
begin
  select fuso into v_fuso from public.petshops where id = p_petshop;
  if v_fuso is null then return jsonb_build_object('aberto', false, 'proxima_abertura', null); end if;
  v_hoje := (v_agora at time zone v_fuso)::date;

  for i in 0..14 loop
    v_dia := v_hoje + i;
    for r in select abre, fecha from public.horarios_funcionamento
              where petshop_id = p_petshop and dia_semana = extract(dow from v_dia)::int
              order by abre loop
      v_ini := (v_dia + r.abre) at time zone v_fuso;
      v_fim := (v_dia + r.fecha) at time zone v_fuso;
      if v_fim <= v_agora then continue; end if;
      v_ini := greatest(v_ini, v_agora);
      -- empurra o início para depois de bloqueios do pet shop inteiro
      loop
        select max(b.fim) into v_bfim from public.bloqueios b
         where b.petshop_id = p_petshop and b.recurso_id is null
           and b.inicio <= v_ini and b.fim > v_ini;
        exit when v_bfim is null;
        v_ini := v_bfim;
      end loop;
      if v_ini < v_fim then v_prox := v_ini; exit; end if;
    end loop;
    exit when v_prox is not null;
  end loop;

  if v_prox is null then
    return jsonb_build_object('aberto', false, 'proxima_abertura', null);
  end if;
  if v_prox <= v_agora + interval '1 minute' then
    return jsonb_build_object('aberto', true, 'proxima_abertura', null);
  end if;
  v_dia := (v_prox at time zone v_fuso)::date;
  v_txt := case when v_dia = v_hoje then 'hoje'
                when v_dia = v_hoje + 1 then 'amanhã'
                else v_dias[extract(dow from v_dia)::int + 1] || ' (' || to_char(v_dia, 'DD/MM') || ')' end
           || ' às ' || to_char(v_prox at time zone v_fuso, 'HH24:MI');
  return jsonb_build_object('aberto', false, 'proxima_abertura', v_txt);
end $$;

-- ---------------------------------------------------------------------
-- 7. Registro de mensagens (CM-11). Só metadados.
-- ---------------------------------------------------------------------
create or replace function public.bot_registrar_mensagem(
  p_petshop      uuid,
  p_telefone     text,
  p_direcao      text,
  p_tipo         text,
  p_status       text default null,
  p_agendamento  uuid default null,
  p_id_externo   text default null,
  p_erro         text default null) returns uuid
language sql volatile security definer set search_path = '' as $$
  insert into public.mensagens_log (petshop_id, telefone, agendamento_id, direcao, tipo,
                                    categoria_cobranca, canal, status, erro, id_externo)
  select p_petshop, private.normalizar_telefone(p_telefone), p_agendamento, p_direcao, p_tipo,
         case when p_direcao = 'entrada' then null
              when p_tipo in ('confirmacao','lembrete','cancelamento','pet_pronto') then 'utilidade'
              when p_tipo = 'reativacao' then 'marketing'
              else 'servico' end,
         (select canal from public.bot_config where petshop_id = p_petshop),
         coalesce(p_status, case when p_direcao = 'entrada' then 'recebida' else 'enviada' end),
         left(p_erro, 500), p_id_externo
  returning id;
$$;

-- ---------------------------------------------------------------------
-- 8. fromMe (BT-18). Com "Notificar enviadas por mim" ligado, a Z-API
--    devolve TAMBÉM as mensagens que o próprio bot mandou pela API.
--    Sem esta checagem, cada resposta do bot pausaria o bot.
--    O N8n espera alguns segundos antes de chamar (dá tempo de o envio
--    gravar o id_externo) e passa from_api quando a Z-API informar.
-- ---------------------------------------------------------------------
create or replace function public.bot_registrar_fromme(
  p_petshop uuid, p_telefone text, p_message_id text, p_from_api boolean default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(p_from_api, false) then return 'eco_do_bot'; end if;
  if p_message_id is not null and exists (
       select 1 from public.mensagens_log
        where petshop_id = p_petshop and id_externo = p_message_id
          and direcao = 'saida' and tipo <> 'humano') then   -- só o que o bot enviou
    return 'eco_do_bot';
  end if;
  perform public.bot_pausar_por_humano(p_petshop, p_telefone);
  perform public.bot_registrar_mensagem(p_petshop, p_telefone, 'saida', 'humano', 'enviada', null, p_message_id);
  return 'pausado';
end $$;

-- ---------------------------------------------------------------------
-- 9. Lembretes 24h. Mesma assinatura do 05; agora também:
--    - só pet shop com bot ligado;
--    - fora de período bloqueado (o dono é avisado pela função 11);
--    - respeita o limite semanal de mensagens automáticas (CM-10).
-- ---------------------------------------------------------------------
create or replace function public.lembretes_pendentes(p_petshop uuid default null) returns table (
  agendamento_id uuid, petshop_id uuid, telefone text, nome_tutor text, pet text,
  data text, hora text, servicos text, nome_bot text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.petshop_id, t.telefone, tp.nome, p.nome,
         to_char(a.inicio at time zone ps.fuso, 'DD/MM'), to_char(a.inicio at time zone ps.fuso, 'HH24:MI'),
         (select string_agg(i.descricao, ' + ') from public.agendamento_itens i where i.agendamento_id = a.id),
         bc.nome_bot
    from public.agendamentos a
    join public.petshops ps      on ps.id = a.petshop_id and ps.ativo
    join public.bot_config bc    on bc.petshop_id = a.petshop_id and bc.ativo
    join public.tutores t        on t.id = a.tutor_id
    join public.tutor_petshop tp on tp.tutor_id = a.tutor_id and tp.petshop_id = a.petshop_id
    join public.pets p           on p.id = a.pet_id
   where a.status = 'confirmado'
     and (a.inicio at time zone ps.fuso)::date = (now() at time zone ps.fuso)::date + 1
     and tp.aceita_mensagens
     and (p_petshop is null or a.petshop_id = p_petshop)
     and not exists (select 1 from public.lembretes l where l.agendamento_id = a.id and l.tipo = '24h')
     and not exists (select 1 from public.bloqueios b
                      where b.petshop_id = a.petshop_id
                        and (b.recurso_id is null or b.recurso_id = a.recurso_id)
                        and tstzrange(b.inicio, b.fim, '[)') && tstzrange(a.inicio, a.fim, '[)'))
     and (select count(*) from public.mensagens_log m
           where m.petshop_id = a.petshop_id and m.telefone = t.telefone and m.direcao = 'saida'
             and m.tipo in ('lembrete','reativacao','pet_pronto') and m.status <> 'falha'
             and m.criado_em > now() - interval '7 days') < bc.limite_msgs_auto_semana
   order by a.petshop_id, a.inicio;
$$;

-- ---------------------------------------------------------------------
-- 10. Lembrete: marcar antes de enviar e tratar a resposta.
-- ---------------------------------------------------------------------
-- Marca o lembrete ANTES do envio. Se o cron rodar duas vezes, a segunda
-- recebe false e não manda de novo (unique agendamento + tipo).
create or replace function public.bot_lembrete_marcar(p_agendamento uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.lembretes (petshop_id, agendamento_id, tipo)
  select a.petshop_id, a.id, '24h' from public.agendamentos a where a.id = p_agendamento
  on conflict (agendamento_id, tipo) do nothing;
  return found;
end $$;

-- Envio falhou: libera para o próximo cron tentar de novo.
create or replace function public.bot_lembrete_desmarcar(p_agendamento uuid) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.lembretes where agendamento_id = p_agendamento and tipo = '24h' and resposta is null;
$$;

-- Resposta SIM/NÃO do tutor. Procura o lembrete mais recente sem resposta
-- (até 36 h) de um agendamento futuro deste tutor neste pet shop.
create or replace function public.bot_responder_lembrete(
  p_petshop uuid, p_telefone text, p_resposta text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tel   text := private.normalizar_telefone(p_telefone);
  v_resp  text := lower(trim(p_resposta));
  r       record;
begin
  if v_resp not in ('sim','nao') then
    raise exception 'Resposta deve ser sim ou nao' using errcode = '22023';
  end if;

  select l.id as lembrete_id, a.id as agendamento_id, a.status, p.nome as pet, tp.nome as nome_tutor,
         to_char(a.inicio at time zone ps.fuso, 'DD/MM') as data,
         to_char(a.inicio at time zone ps.fuso, 'HH24:MI') as hora,
         bc.telefone_avisos
    into r
    from public.lembretes l
    join public.agendamentos a   on a.id = l.agendamento_id
    join public.tutores t        on t.id = a.tutor_id
    join public.pets p           on p.id = a.pet_id
    join public.petshops ps      on ps.id = a.petshop_id
    join public.tutor_petshop tp on tp.tutor_id = a.tutor_id and tp.petshop_id = a.petshop_id
    left join public.bot_config bc on bc.petshop_id = a.petshop_id
   where a.petshop_id = p_petshop and t.telefone = v_tel
     and l.tipo = '24h' and l.resposta is null and l.enviado_em > now() - interval '36 hours'
     and a.inicio > now() and a.status in ('pendente','confirmado')
   order by l.enviado_em desc
   limit 1;

  if r.lembrete_id is null then
    return jsonb_build_object('encontrado', false);
  end if;

  if v_resp = 'sim' then
    update public.lembretes set resposta = 'confirmado', respondido_em = now() where id = r.lembrete_id;
    if r.status = 'pendente' then
      update public.agendamentos set status = 'confirmado' where id = r.agendamento_id;
    end if;
  else
    update public.agendamentos
       set status = 'cancelado', motivo_cancelamento = 'Cancelado pelo tutor no lembrete'
     where id = r.agendamento_id;
    update public.lembretes set resposta = 'cancelado', respondido_em = now() where id = r.lembrete_id;
  end if;

  return jsonb_build_object(
    'encontrado', true,
    'acao', case when v_resp = 'sim' then 'confirmado' else 'cancelado' end,
    'agendamento_id', r.agendamento_id, 'pet', r.pet, 'nome_tutor', r.nome_tutor,
    'data', r.data, 'hora', r.hora, 'telefone_avisos', r.telefone_avisos);
end $$;

-- ---------------------------------------------------------------------
-- 11. Agendamentos de amanhã em período bloqueado: aviso ao dono.
--     Uma linha por pet shop, com a lista pronta para a mensagem.
-- ---------------------------------------------------------------------
create or replace function public.bot_agendamentos_em_bloqueio(p_petshop uuid default null) returns table (
  petshop_id uuid, telefone_avisos text, itens jsonb)
language sql stable security definer set search_path = '' as $$
  select a.petshop_id, bc.telefone_avisos,
         jsonb_agg(jsonb_build_object(
           'hora', to_char(a.inicio at time zone ps.fuso, 'HH24:MI'),
           'data', to_char(a.inicio at time zone ps.fuso, 'DD/MM'),
           'pet', p.nome, 'tutor', tp.nome, 'telefone', t.telefone) order by a.inicio)
    from public.agendamentos a
    join public.petshops ps      on ps.id = a.petshop_id and ps.ativo
    join public.bot_config bc    on bc.petshop_id = a.petshop_id and bc.ativo
    join public.tutores t        on t.id = a.tutor_id
    join public.tutor_petshop tp on tp.tutor_id = a.tutor_id and tp.petshop_id = a.petshop_id
    join public.pets p           on p.id = a.pet_id
   where a.status in ('pendente','confirmado')
     and (a.inicio at time zone ps.fuso)::date = (now() at time zone ps.fuso)::date + 1
     and (p_petshop is null or a.petshop_id = p_petshop)
     and exists (select 1 from public.bloqueios b
                  where b.petshop_id = a.petshop_id
                    and (b.recurso_id is null or b.recurso_id = a.recurso_id)
                    and tstzrange(b.inicio, b.fim, '[)') && tstzrange(a.inicio, a.fim, '[)'))
   group by a.petshop_id, bc.telefone_avisos;
$$;

-- ---------------------------------------------------------------------
-- 12. Conexão do WhatsApp (PL-03)
-- ---------------------------------------------------------------------
create or replace function public.bot_instancias_monitoradas() returns table (
  petshop_id uuid, petshop text, zapi_instance_id text, token text, ativo boolean)
language sql stable security definer set search_path = '' as $$
  select bc.petshop_id, ps.nome, bc.zapi_instance_id, ds.decrypted_secret, bc.ativo
    from public.bot_config bc
    join public.petshops ps on ps.id = bc.petshop_id and ps.ativo
    left join vault.decrypted_secrets ds on ds.id = bc.token_secret_id
   where bc.canal = 'zapi' and bc.zapi_instance_id is not null;
$$;

-- Registra o estado e diz se é hora de alertar:
--   queda: na transição e, se continuar caído, a cada 6 h;
--   volta: só se a queda tinha sido alertada.
create or replace function public.bot_conexao_evento(
  p_instance text, p_conectado boolean, p_detalhe text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cfg    public.bot_config;
  v_nome   text;
  v_novo   text := case when p_conectado then 'conectado' else 'desconectado' end;
  v_queda  boolean := false;
  v_volta  boolean := false;
begin
  select * into v_cfg from public.bot_config where zapi_instance_id = p_instance;
  if v_cfg.petshop_id is null then
    return jsonb_build_object('encontrado', false);
  end if;
  select nome into v_nome from public.petshops where id = v_cfg.petshop_id;

  if v_novo <> 'conectado' then
    v_queda := v_cfg.conexao_status = 'conectado'
            or v_cfg.conexao_alertado_em is null
            or v_cfg.conexao_alertado_em < now() - interval '6 hours';
  else
    v_volta := v_cfg.conexao_status <> 'conectado' and v_cfg.conexao_alertado_em is not null;
  end if;

  update public.bot_config
     set conexao_status = v_novo,
         conexao_verificada_em = now(),
         conexao_alertado_em = case when v_queda then now()
                                    when v_novo = 'conectado' then null
                                    else conexao_alertado_em end
   where petshop_id = v_cfg.petshop_id;

  return jsonb_build_object(
    'encontrado', true, 'petshop_id', v_cfg.petshop_id, 'petshop', v_nome,
    'status', v_novo, 'anterior', v_cfg.conexao_status, 'bot_ativo', v_cfg.ativo,
    'alertar_queda', v_queda, 'alertar_volta', v_volta, 'detalhe', p_detalhe);
end $$;

-- ---------------------------------------------------------------------
-- 13. Erros dos fluxos (PL-04)
-- ---------------------------------------------------------------------
-- Devolve se é o primeiro erro da última hora: o N8n só manda e-mail
-- nesse caso (o Resend gratuito tem teto de 100 e-mails por dia).
drop function if exists public.bot_registrar_erro(text, text, text, text, text, uuid);
create or replace function public.bot_registrar_erro(
  p_workflow text, p_no text, p_mensagem text,
  p_execucao text default null, p_url text default null, p_petshop uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_recentes int;
begin
  select count(*) into v_recentes from public.fluxo_erros where criado_em > now() - interval '1 hour';
  insert into public.fluxo_erros (petshop_id, workflow, no, mensagem, execucao_id, url_execucao)
  values (p_petshop, coalesce(p_workflow, '?'), p_no, left(coalesce(p_mensagem, '?'), 2000), p_execucao, p_url)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'enviar_email', v_recentes = 0, 'erros_ultima_hora', v_recentes + 1);
end $$;

-- ---------------------------------------------------------------------
-- Permissões: só o service_role (secret key do N8n)
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.bot_servicos(uuid, text)',
    'public.bot_envio(uuid)',
    'public.bot_aberto_agora(uuid)',
    'public.bot_registrar_mensagem(uuid, text, text, text, text, uuid, text, text)',
    'public.bot_registrar_fromme(uuid, text, text, boolean)',
    'public.lembretes_pendentes(uuid)',
    'public.bot_lembrete_marcar(uuid)',
    'public.bot_lembrete_desmarcar(uuid)',
    'public.bot_responder_lembrete(uuid, text, text)',
    'public.bot_agendamentos_em_bloqueio(uuid)',
    'public.bot_instancias_monitoradas()',
    'public.bot_conexao_evento(text, boolean, text)',
    'public.bot_registrar_erro(text, text, text, text, text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
grant all on public.fluxo_erros to service_role;

commit;

select 'Arquivo 13 aplicado: RPCs do bot no N8n.' as resultado;
