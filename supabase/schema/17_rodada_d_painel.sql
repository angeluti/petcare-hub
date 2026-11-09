-- =====================================================================
-- PetCare Hub · 17 · Rodada D do painel (bot no painel)
-- RL-02/RL-03 relatórios da POC · BT-09 pausar e devolver o bot por tutor ·
-- celular para avisos (bot_config.telefone_avisos) · TP-12/TP-15 na ficha.
-- Pré-requisito: arquivos 01 a 16. Idempotente: pode rodar de novo sem erro.
-- =====================================================================
begin;

-- =====================================================================
-- 1. bot_config: o dono só mexe no que é dele
-- Antes: a política bot_config_alterar (arquivo 07) deixava dono/gerente
-- trocar canal, instância, token, ativo e conexão. Agora, quem não é da
-- Harpia só altera nome_bot, saudacao, pausa_humana_horas,
-- timeout_conversa_horas e telefone_avisos, e não cria bot_config.
-- O celular de avisos precisa ser diferente do WhatsApp do pet shop.
-- =====================================================================
create or replace function private.proteger_bot_config() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  livres constant text[] := array['nome_bot','saudacao','pausa_humana_horas','timeout_conversa_horas',
                                  'telefone_avisos','atualizado_em'];
  v_wp text;
begin
  if (select auth.uid()) is not null and not private.eh_super_admin() then
    if tg_op = 'INSERT' then
      raise exception 'O bot do pet shop é criado pela equipe PetCare Hub' using errcode = '42501';
    end if;
    if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
      raise exception 'Canal, conexão, token e ativação do bot só podem ser alterados pela Harpia'
        using errcode = '42501';
    end if;
  end if;

  if new.telefone_avisos is not null then
    select telefone_wp into v_wp from public.petshops where id = new.petshop_id;
    if new.telefone_avisos = v_wp then
      raise exception 'O celular para avisos precisa ser diferente do WhatsApp do pet shop'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bot_config_proteger on public.bot_config;
create trigger bot_config_proteger before insert or update on public.bot_config
  for each row execute function private.proteger_bot_config();

-- =====================================================================
-- 2. BT-09 · pausa do bot por tutor: desde quando e por quem
-- humano_desde: quando a conversa entrou em 'humano' (o bot estende a pausa
-- a cada resposta do dono sem mudar o início). humano_por: usuário do painel
-- que pausou; nulo = automático (dono respondeu pelo celular ou o tutor
-- pediu atendente). Preenchido por trigger: as funções do 05/13 não mudam.
-- =====================================================================
alter table public.bot_conversas add column if not exists humano_desde timestamptz;
alter table public.bot_conversas add column if not exists humano_por uuid references auth.users(id) on delete set null;

create or replace function private.bot_conversas_marcar_humano() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.estado = 'humano' then
    if tg_op = 'INSERT' or old.estado is distinct from 'humano' then
      new.humano_desde := now();
      new.humano_por   := (select auth.uid());
    end if;
  else
    new.humano_desde := null;
    new.humano_por   := null;
  end if;
  return new;
end $$;

drop trigger if exists bot_conversas_humano on public.bot_conversas;
create trigger bot_conversas_humano before insert or update on public.bot_conversas
  for each row execute function private.bot_conversas_marcar_humano();

-- Pausar pelo painel (SECURITY INVOKER: a RLS do 07 decide; papéis de operação).
-- Mesmo efeito de bot_pausar_por_humano: humano até agora + pausa_humana_horas.
-- Conversa 'bloqueada' continua bloqueada.
create or replace function public.pausar_bot_tutor(p_petshop uuid, p_telefone text)
returns public.bot_conversas
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_tel   text := private.normalizar_telefone(p_telefone);
  v_horas int;
  v_tutor uuid;
  v_row   public.bot_conversas;
begin
  if v_tel is null or v_tel !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Telefone inválido: %', p_telefone using errcode = '22023';
  end if;
  select coalesce(pausa_humana_horas, 4) into v_horas from public.bot_config where petshop_id = p_petshop;
  select tp.tutor_id into v_tutor
    from public.tutor_petshop tp join public.tutores t on t.id = tp.tutor_id
   where tp.petshop_id = p_petshop and t.telefone = v_tel;

  insert into public.bot_conversas (petshop_id, telefone, tutor_id, estado, humano_ate, dados_temp)
  values (p_petshop, v_tel, v_tutor, 'humano', now() + make_interval(hours => coalesce(v_horas, 4)), '{}')
  on conflict (petshop_id, telefone) do update
     set estado     = case when public.bot_conversas.estado = 'bloqueado' then 'bloqueado' else 'humano' end,
         humano_ate = excluded.humano_ate,
         tutor_id   = coalesce(public.bot_conversas.tutor_id, excluded.tutor_id),
         dados_temp = '{}'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Sem permissão para pausar o bot neste pet shop' using errcode = '42501';
  end if;
  return v_row;
end $$;
revoke execute on function public.pausar_bot_tutor(uuid, text) from public, anon;
grant  execute on function public.pausar_bot_tutor(uuid, text) to authenticated, service_role;

-- bot_devolver (arquivo 05) já é SECURITY INVOKER e liberada para authenticated;
-- só reforça o grant aqui.
grant execute on function public.bot_devolver(uuid) to authenticated;

-- Lista das conversas com o bot pausado (nome do tutor vem do vínculo deste pet shop).
create or replace function public.conversas_pausadas(p_petshop uuid)
returns table (conversa_id uuid, telefone text, tutor_id uuid, tutor_nome text, estado text,
               humano_desde timestamptz, humano_ate timestamptz, pausado_por_painel boolean, vencida boolean)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.telefone, c.tutor_id, tp.nome, c.estado, c.humano_desde, c.humano_ate,
         c.humano_por is not null, (c.estado = 'humano' and c.humano_ate is not null and c.humano_ate <= now())
    from public.bot_conversas c
    left join public.tutor_petshop tp on tp.tutor_id = c.tutor_id and tp.petshop_id = c.petshop_id
   where c.petshop_id = p_petshop and c.estado in ('humano', 'bloqueado')
   order by c.estado, c.humano_ate nulls last;
$$;
revoke execute on function public.conversas_pausadas(uuid) from public, anon;
grant  execute on function public.conversas_pausadas(uuid) to authenticated, service_role;

-- =====================================================================
-- 3. TP-12 · quem ligou ou desligou as mensagens automáticas, e quando
-- O tutor muda pelo bot (SAIR/ATIVAR, arquivo 16, sem auth.uid → 'bot').
-- O dono pode mudar no painel a pedido do tutor no balcão → 'painel' + usuário.
-- =====================================================================
alter table public.tutor_petshop add column if not exists mensagens_alterado_em timestamptz;
alter table public.tutor_petshop add column if not exists mensagens_alterado_por uuid references auth.users(id) on delete set null;
alter table public.tutor_petshop add column if not exists mensagens_alterado_origem text;
do $$ begin
  alter table public.tutor_petshop add constraint tutor_petshop_mensagens_origem_check
    check (mensagens_alterado_origem is null or mensagens_alterado_origem in ('bot','painel'));
exception when duplicate_object then null; end $$;

create or replace function private.tutor_petshop_registrar_mensagens() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.aceita_mensagens is distinct from old.aceita_mensagens then
    new.mensagens_alterado_em     := now();
    new.mensagens_alterado_por    := (select auth.uid());
    new.mensagens_alterado_origem := case when (select auth.uid()) is null then 'bot' else 'painel' end;
    new.opt_out_em := case when new.aceita_mensagens then null else coalesce(new.opt_out_em, now()) end;
  end if;
  return new;
end $$;

drop trigger if exists tutor_petshop_mensagens on public.tutor_petshop;
create trigger tutor_petshop_mensagens before update on public.tutor_petshop
  for each row execute function private.tutor_petshop_registrar_mensagens();

-- =====================================================================
-- 4. RL-03 · quem pediu o cancelamento
-- 'tutor' = bot, lembrete ou pedido do tutor ao pet shop; 'petshop' = decisão
-- do pet shop. Sem valor informado: sem auth.uid (N8n) → 'tutor'; painel → 'petshop'.
-- =====================================================================
alter table public.agendamentos add column if not exists cancelado_por text;
do $$ begin
  alter table public.agendamentos add constraint agendamentos_cancelado_por_check
    check (cancelado_por is null or cancelado_por in ('tutor','petshop'));
exception when duplicate_object then null; end $$;

create or replace function private.agendamentos_cancelado_por() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'cancelado' then
    if tg_op = 'INSERT' or old.status is distinct from 'cancelado' then
      new.cancelado_por := coalesce(new.cancelado_por,
                                    case when (select auth.uid()) is null then 'tutor' else 'petshop' end);
    end if;
  else
    new.cancelado_por := null;
  end if;
  return new;
end $$;

drop trigger if exists agendamentos_cancelado_por on public.agendamentos;
create trigger agendamentos_cancelado_por before insert or update of status, cancelado_por on public.agendamentos
  for each row execute function private.agendamentos_cancelado_por();

-- Cancelamentos já existentes: o texto do bot identifica o tutor.
update public.agendamentos
   set cancelado_por = case when motivo_cancelamento ilike 'Cancelado pelo tutor%' then 'tutor' else 'petshop' end
 where status = 'cancelado' and cancelado_por is null;

-- =====================================================================
-- 5. RL-02 e RL-03 · relatório da POC
-- RPC e não view: o período é parâmetro e o fuso é de cada pet shop.
-- SECURITY INVOKER: a RLS de agendamentos vale; além disso só dono, gerente
-- e super admin. Datas pelo início do atendimento, no fuso do pet shop.
--   % bot       = origem 'bot' entre os não cancelados / não cancelados
--   no-show     = no_show / (entregue + no_show), só atendimentos já passados
--   cancelamento= cancelados / total do período (tutor x pet shop)
--   sem_desfecho= já passados ainda pendente/confirmado/em_atendimento/pronto
--                 (dono não marcou entregue nem "não veio": distorce o no-show)
-- =====================================================================
create or replace function public.relatorio_poc(p_petshop uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_tz  text;
  v_ini timestamptz;
  v_fim timestamptz;
  v_res jsonb;
begin
  if not ((select private.eh_super_admin())
          or p_petshop in (select private.petshops_com_papel(private.papeis_config()))) then
    raise exception 'Relatórios só para dono, gerente e equipe PetCare Hub' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if p_ate - p_de > 366 then
    raise exception 'Período máximo: 1 ano' using errcode = '22023';
  end if;

  select fuso into v_tz from public.petshops where id = p_petshop;
  v_ini := p_de::timestamp at time zone v_tz;
  v_fim := (p_ate + 1)::timestamp at time zone v_tz;

  with base as (
    select a.status, a.origem, a.cancelado_por, a.motivo_cancelamento,
           a.inicio < now() as passou,
           (date_trunc('week', a.inicio at time zone v_tz))::date as semana
      from public.agendamentos a
     where a.petshop_id = p_petshop and a.inicio >= v_ini and a.inicio < v_fim
  ),
  grupos as (
    select semana,
           count(*)                                                        as total,
           count(*) filter (where status = 'cancelado')                    as cancelados,
           count(*) filter (where status = 'cancelado' and cancelado_por = 'tutor')   as cancel_tutor,
           count(*) filter (where status = 'cancelado' and cancelado_por = 'tutor'
                              and motivo_cancelamento ilike 'Cancelado pelo tutor no%') as cancel_tutor_bot,
           count(*) filter (where status = 'cancelado' and cancelado_por = 'petshop') as cancel_petshop,
           count(*) filter (where status <> 'cancelado')                   as nao_cancelados,
           count(*) filter (where status <> 'cancelado' and origem = 'bot') as pelo_bot,
           count(*) filter (where passou and status = 'entregue')          as entregues,
           count(*) filter (where passou and status = 'no_show')           as no_show,
           count(*) filter (where passou and status in ('pendente','confirmado','em_atendimento','pronto')) as sem_desfecho
      from base
     group by grouping sets ((semana), ())
  ),
  calc as (
    select g.*,
           round(100.0 * pelo_bot / nullif(nao_cancelados, 0), 1)       as pct_bot,
           round(100.0 * no_show / nullif(entregues + no_show, 0), 1)    as pct_no_show,
           round(100.0 * cancelados / nullif(total, 0), 1)               as pct_cancelamento
      from grupos g
  )
  select jsonb_build_object(
           'petshop_id', p_petshop,
           'fuso', v_tz,
           'de', p_de,
           'ate', p_ate,
           'gerado_em', now(),
           'bot_ativo', coalesce((select b.ativo and b.canal <> 'teste' from public.bot_config b where b.petshop_id = p_petshop), false),
           'meta_pct_bot', 30,
           'totais', coalesce((select to_jsonb(c) - 'semana' from calc c where c.semana is null),
                              jsonb_build_object('total', 0)),
           'semanas', coalesce((select jsonb_agg(to_jsonb(c) order by c.semana) from calc c where c.semana is not null), '[]'::jsonb))
    into v_res;
  return v_res;
end $$;
revoke execute on function public.relatorio_poc(uuid, date, date) from public, anon;
grant  execute on function public.relatorio_poc(uuid, date, date) to authenticated, service_role;

commit;

select 'Arquivo 17 aplicado: relatórios da POC, pausa do bot pelo painel, celular de avisos protegido, histórico das mensagens automáticas.' as resultado;
