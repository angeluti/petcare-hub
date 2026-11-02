-- =====================================================================
-- PetCare Hub · 05 · Bot do WhatsApp
-- Mudança importante: o estado da conversa saiu de tutores.estado_bot.
-- Agora o tutor é global, mas a conversa é com o número de UM pet shop.
-- Por isso: bot_conversas (petshop_id, telefone). Isso também cobre o
-- primeiro contato de alguém que ainda não é tutor cadastrado.
-- Segredos (token da Z-API / Meta) ficam no Supabase Vault, nunca em tabela
-- legível pelo painel. bot_config guarda só o id do segredo.
-- =====================================================================
begin;

create table public.bot_config (
  petshop_id              uuid primary key references public.petshops(id) on delete cascade,
  nome_bot                text not null default 'Assistente',
  saudacao                text not null default 'Oi! Eu sou {bot}, assistente do {petshop}. Como posso ajudar?',
  tom                     text not null default 'padrao' check (tom in ('padrao','personalizado')),
  mensagens               jsonb not null default '{}',     -- sobrescreve textos padrão (setup Personalizado)
  canal                   text not null default 'zapi' check (canal in ('zapi','meta_oficial')),
  zapi_instance_id        text unique,                     -- identificador (não é segredo): roteia o webhook
  meta_phone_number_id    text unique,
  token_secret_id         uuid,                            -- id do segredo no Vault
  conexao_status          text not null default 'desconectado' check (conexao_status in ('desconectado','conectado','erro')),
  conexao_verificada_em   timestamptz,
  pausa_humana_horas      int not null default 4 check (pausa_humana_horas between 1 and 72),
  timeout_conversa_horas  int not null default 6 check (timeout_conversa_horas between 1 and 72),
  limite_msgs_auto_semana int not null default 3 check (limite_msgs_auto_semana between 0 and 20),
  ativo                   boolean not null default false,  -- liga só depois da semana de agenda no painel
  atualizado_em           timestamptz not null default now()
);
create trigger bot_config_atualizado before update on public.bot_config
  for each row execute function private.tocar_atualizado_em();

create table public.bot_conversas (
  id              uuid primary key default gen_random_uuid(),
  petshop_id      uuid not null references public.petshops(id) on delete cascade,
  telefone        text not null check (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  tutor_id        uuid references public.tutores(id) on delete set null,
  estado          text not null default 'novo' check (estado in (
                    'novo','idle','menu','aguardando_pet','aguardando_porte','aguardando_data',
                    'aguardando_hora','aguardando_confirmacao','aguardando_cancelamento','humano','bloqueado')),
  dados_temp      jsonb not null default '{}',
  humano_ate      timestamptz,             -- pausa automática: bot volta sozinho depois disto
  ultimo_contato  timestamptz not null default now(),
  criado_em       timestamptz not null default now(),
  unique (petshop_id, telefone)
);

-- Registro de mensagens (CM-11) e base para medir custo da API oficial.
-- Guarda metadados, não o texto da conversa (minimização LGPD).
create table public.mensagens_log (
  id                  uuid primary key default gen_random_uuid(),
  petshop_id          uuid not null references public.petshops(id) on delete cascade,
  telefone            text not null,
  agendamento_id      uuid references public.agendamentos(id) on delete set null,
  direcao             text not null check (direcao in ('entrada','saida')),
  tipo                text not null check (tipo in ('conversa','confirmacao','lembrete','cancelamento','reativacao',
                                                    'pet_pronto','transbordo','alerta_dono','outro')),
  categoria_cobranca  text check (categoria_cobranca in ('servico','utilidade','marketing','autenticacao')),
  canal               text check (canal in ('zapi','meta_oficial')),
  status              text not null default 'enviada' check (status in ('recebida','enviada','entregue','lida','falha')),
  erro                text,
  id_externo          text,
  criado_em           timestamptz not null default now()
);
create index mensagens_log_petshop_idx on public.mensagens_log (petshop_id, criado_em desc);
create index mensagens_log_tel_idx on public.mensagens_log (petshop_id, telefone, criado_em desc);

-- ---------------------------------------------------------------------
-- RPCs do bot (só service_role / secret key do N8n; revogadas no 07)
-- ---------------------------------------------------------------------

-- Ponto de entrada de cada mensagem recebida. Faz upsert da conversa,
-- aplica timeout e fim da pausa humana, e devolve tudo que o fluxo precisa.
-- Nunca devolve nome de outro pet shop: só pets compartilháveis.
create or replace function public.bot_entrada(p_petshop uuid, p_telefone text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tel     text := private.normalizar_telefone(p_telefone);
  v_cfg     public.bot_config;
  v_conv    public.bot_conversas;
  v_tutor   uuid;
  v_aqui    boolean := false;
  v_nome    text;
  v_pets    jsonb := '[]';
  v_compart jsonb := '[]';
begin
  select * into v_cfg from public.bot_config where petshop_id = p_petshop;
  select t.id into v_tutor from public.tutores t where t.telefone = v_tel;
  if v_tutor is not null then
    select true, tp.nome into v_aqui, v_nome
      from public.tutor_petshop tp where tp.tutor_id = v_tutor and tp.petshop_id = p_petshop and tp.ativo;
    v_aqui := coalesce(v_aqui, false);
  end if;

  insert into public.bot_conversas (petshop_id, telefone, tutor_id, estado)
  values (p_petshop, v_tel, case when v_aqui then v_tutor end, case when v_aqui then 'idle' else 'novo' end)
  on conflict (petshop_id, telefone) do update
     set tutor_id = coalesce(public.bot_conversas.tutor_id, excluded.tutor_id)
  returning * into v_conv;

  -- Fim da pausa humana
  if v_conv.estado = 'humano' and v_conv.humano_ate is not null and v_conv.humano_ate < now() then
    v_conv.estado := 'idle'; v_conv.humano_ate := null; v_conv.dados_temp := '{}';
  end if;
  -- Timeout de conversa parada no meio de um fluxo
  if v_conv.estado like 'aguardando_%' or v_conv.estado = 'menu' then
    if v_conv.ultimo_contato < now() - make_interval(hours => coalesce(v_cfg.timeout_conversa_horas, 6)) then
      v_conv.estado := case when v_aqui then 'idle' else 'novo' end; v_conv.dados_temp := '{}';
    end if;
  end if;

  update public.bot_conversas
     set estado = v_conv.estado, humano_ate = v_conv.humano_ate, dados_temp = v_conv.dados_temp,
         ultimo_contato = now()
   where id = v_conv.id
   returning * into v_conv;

  if v_aqui then
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'porte', p.porte) order by p.nome), '[]')
      into v_pets
      from public.pet_petshop pp join public.pets p on p.id = pp.pet_id
     where pp.petshop_id = p_petshop and pp.ativo and p.tutor_id = v_tutor;
  end if;

  -- Pets do mesmo tutor em outros pet shops, só com consentimento (TP-16 / BT-17).
  if v_tutor is not null and private.tutor_consente(v_tutor, 'compartilhar_dados_pet') then
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'porte', p.porte) order by p.nome), '[]')
      into v_compart
      from public.pets p
     where p.tutor_id = v_tutor
       and not exists (select 1 from public.pet_petshop pp where pp.pet_id = p.id and pp.petshop_id = p_petshop);
  end if;

  return jsonb_build_object(
    'conversa_id', v_conv.id,
    'estado', v_conv.estado,
    'dados_temp', v_conv.dados_temp,
    'tutor_id', v_tutor,
    'conhecido_aqui', v_aqui,
    'nome_tutor', v_nome,
    'pets', v_pets,
    'pets_compartilhaveis', v_compart,
    'bot', jsonb_build_object('ativo', coalesce(v_cfg.ativo, false), 'nome', v_cfg.nome_bot, 'saudacao', v_cfg.saudacao)
  );
end $$;

-- Atualiza estado e dados_temp a cada passo do fluxo.
create or replace function public.bot_salvar_estado(
  p_conversa uuid, p_estado text, p_dados_temp jsonb default null) returns void
language sql volatile security definer set search_path = '' as $$
  update public.bot_conversas
     set estado = p_estado,
         dados_temp = case when p_estado = 'idle' then '{}'::jsonb else coalesce(p_dados_temp, dados_temp) end,
         ultimo_contato = now()
   where id = p_conversa;
$$;

-- fromMe: o dono respondeu pelo celular → bot fica em silêncio por N horas.
-- Cada nova mensagem do dono estende a pausa.
create or replace function public.bot_pausar_por_humano(p_petshop uuid, p_telefone text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_horas int;
begin
  select coalesce(pausa_humana_horas, 4) into v_horas from public.bot_config where petshop_id = p_petshop;
  insert into public.bot_conversas (petshop_id, telefone, estado, humano_ate)
  values (p_petshop, private.normalizar_telefone(p_telefone), 'humano', now() + make_interval(hours => coalesce(v_horas, 4)))
  on conflict (petshop_id, telefone) do update
     set estado = case when public.bot_conversas.estado = 'bloqueado' then 'bloqueado' else 'humano' end,
         humano_ate = excluded.humano_ate,
         dados_temp = '{}';
end $$;

-- Botão "devolver ao bot" no painel (SECURITY INVOKER: RLS decide).
create or replace function public.bot_devolver(p_conversa uuid) returns void
language sql volatile security invoker set search_path = '' as $$
  update public.bot_conversas set estado = 'idle', humano_ate = null, dados_temp = '{}'
   where id = p_conversa and estado = 'humano';
$$;

-- Primeiro contato pelo bot: cria tutor global (se preciso) + vínculo + conversa ligada.
create or replace function public.bot_cadastrar_tutor(p_petshop uuid, p_telefone text, p_nome text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_tutor uuid;
begin
  v_tutor := public.cadastrar_tutor(p_petshop, p_telefone, p_nome, 'bot');
  update public.bot_conversas set tutor_id = v_tutor
   where petshop_id = p_petshop and telefone = private.normalizar_telefone(p_telefone);
  return v_tutor;
end $$;

-- Tutor conhecido em outro pet shop escolhe um pet já cadastrado (BT-17).
-- Exige consentimento; cria os vínculos sem revelar a origem.
create or replace function public.bot_vincular_pet_compartilhado(p_petshop uuid, p_tutor uuid, p_pet uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_nome text;
begin
  if not private.tutor_consente(p_tutor, 'compartilhar_dados_pet') then
    raise exception 'Tutor sem consentimento para compartilhar dados do pet' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pets where id = p_pet and tutor_id = p_tutor) then
    raise exception 'Pet não pertence a este tutor' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tutor_petshop where tutor_id = p_tutor and petshop_id = p_petshop) then
    -- nome vem do vínculo mais recente (coberto pelo consentimento); o bot pode pedir para confirmar
    select tp.nome into v_nome from public.tutor_petshop tp where tp.tutor_id = p_tutor order by tp.criado_em desc limit 1;
    insert into public.tutor_petshop (tutor_id, petshop_id, nome, origem)
    values (p_tutor, p_petshop, coalesce(v_nome, 'Sem nome'), 'compartilhado');
  end if;
  insert into public.pet_petshop (pet_id, petshop_id, origem)
  values (p_pet, p_petshop, 'compartilhado')
  on conflict (pet_id, petshop_id) do update set ativo = true;
  return p_pet;
end $$;

-- Agendamentos do tutor (BT-05 consultar / BT-06 cancelar).
create or replace function public.bot_agendamentos_tutor(p_petshop uuid, p_tutor uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'pet', p.nome, 'servicos', (select string_agg(i.descricao, ' + ') from public.agendamento_itens i where i.agendamento_id = a.id),
           'data', to_char(a.inicio at time zone ps.fuso, 'DD/MM'), 'hora', to_char(a.inicio at time zone ps.fuso, 'HH24:MI'),
           'status', a.status,
           'pode_cancelar', a.inicio > now() + make_interval(hours => ps.cancelamento_min_horas))
         order by a.inicio), '[]')
    from public.agendamentos a
    join public.pets p on p.id = a.pet_id
    join public.petshops ps on ps.id = a.petshop_id
   where a.petshop_id = p_petshop and a.tutor_id = p_tutor
     and a.status in ('pendente','confirmado') and a.inicio > now();
$$;

create or replace function public.bot_cancelar(p_petshop uuid, p_tutor uuid, p_agendamento uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_horas int;
begin
  select cancelamento_min_horas into v_horas from public.petshops where id = p_petshop;
  update public.agendamentos
     set status = 'cancelado', motivo_cancelamento = 'Cancelado pelo tutor no WhatsApp'
   where id = p_agendamento and petshop_id = p_petshop and tutor_id = p_tutor
     and status in ('pendente','confirmado')
     and inicio > now() + make_interval(hours => v_horas);
  return found;
end $$;

-- Cron das 10h: confirmados de amanhã (no fuso de cada pet shop) sem lembrete enviado.
create or replace function public.lembretes_pendentes(p_petshop uuid default null) returns table (
  agendamento_id uuid, petshop_id uuid, telefone text, nome_tutor text, pet text,
  data text, hora text, servicos text, nome_bot text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.petshop_id, t.telefone, tp.nome, p.nome,
         to_char(a.inicio at time zone ps.fuso, 'DD/MM'), to_char(a.inicio at time zone ps.fuso, 'HH24:MI'),
         (select string_agg(i.descricao, ' + ') from public.agendamento_itens i where i.agendamento_id = a.id),
         bc.nome_bot
    from public.agendamentos a
    join public.petshops ps     on ps.id = a.petshop_id and ps.ativo
    join public.tutores t       on t.id = a.tutor_id
    join public.tutor_petshop tp on tp.tutor_id = a.tutor_id and tp.petshop_id = a.petshop_id
    join public.pets p          on p.id = a.pet_id
    left join public.bot_config bc on bc.petshop_id = a.petshop_id
   where a.status = 'confirmado'
     and (a.inicio at time zone ps.fuso)::date = (now() at time zone ps.fuso)::date + 1
     and tp.aceita_mensagens
     and (p_petshop is null or a.petshop_id = p_petshop)
     and not exists (select 1 from public.lembretes l where l.agendamento_id = a.id and l.tipo = '24h')
   order by a.petshop_id, a.inicio;
$$;

-- Token do canal, lido do Vault. Só para o N8n.
create or replace function public.bot_token(p_petshop uuid) returns text
language sql stable security definer set search_path = '' as $$
  select ds.decrypted_secret
    from public.bot_config bc join vault.decrypted_secrets ds on ds.id = bc.token_secret_id
   where bc.petshop_id = p_petshop;
$$;

-- Roteamento do webhook: qual pet shop é dono desta instância/número?
create or replace function public.bot_petshop_por_instancia(p_zapi_instance text default null, p_meta_phone_id text default null)
returns uuid
language sql stable security definer set search_path = '' as $$
  select petshop_id from public.bot_config
   where (p_zapi_instance is not null and zapi_instance_id = p_zapi_instance)
      or (p_meta_phone_id is not null and meta_phone_number_id = p_meta_phone_id)
   limit 1;
$$;

commit;
