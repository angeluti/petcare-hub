-- =====================================================================
-- PetCare Hub · 03 · Catálogo, recursos e agenda
-- Escolhas da seção 8:
--   (1) check-out como evento único no banco
--   (2) servicos.tipo (estética, consulta, vacina, procedimento, hospedagem, creche)
--   (3) agendamento reserva um RECURSO com CAPACIDADE
--   (5) valores do atendimento guardados por item
-- Toda tabela-filha carrega petshop_id e usa FK composta (id, petshop_id):
-- o banco impede que um registro do pet shop A aponte para algo do B,
-- mesmo que alguém erre o petshop_id num INSERT.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Catálogo de serviços (personalizável por pet shop)
-- ---------------------------------------------------------------------
create table public.servicos (
  id              uuid primary key default gen_random_uuid(),
  petshop_id      uuid not null references public.petshops(id) on delete cascade,
  nome            text not null,
  tipo            text not null default 'estetica'
                    check (tipo in ('estetica','consulta','vacina','procedimento','hospedagem','creche')),
  adicional       boolean not null default false,       -- hidratação, desembolo, corte de unha…
  recurso_tipo    text not null default 'profissional' check (recurso_tipo in ('profissional','sala','baia')),
  descricao       text,
  disponivel_bot  boolean not null default true,
  ordem           int not null default 0,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (petshop_id, nome),
  unique (id, petshop_id)
);
create trigger servicos_atualizado before update on public.servicos
  for each row execute function private.tocar_atualizado_em();

-- Preço E duração por porte: um GG demora mais que um P, e o motor precisa saber.
create table public.servico_precos (
  servico_id   uuid not null,
  petshop_id   uuid not null,
  porte        text not null check (porte in ('P','M','G','GG')),
  preco        numeric(10,2) not null check (preco >= 0),
  duracao_min  int not null check (duracao_min > 0 and duracao_min % 5 = 0),
  primary key (servico_id, porte),
  foreign key (servico_id, petshop_id) references public.servicos (id, petshop_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Recursos: profissional, sala (Vet) ou baia (Day Care).
-- capacidade = pets simultâneos (só vale no modo 'multiplo' do pet shop).
-- intervalo_entrada_min = entrada escalonada: o 2º pet só começa X min depois do 1º.
-- ---------------------------------------------------------------------
create table public.recursos (
  id                     uuid primary key default gen_random_uuid(),
  petshop_id             uuid not null references public.petshops(id) on delete cascade,
  tipo                   text not null default 'profissional' check (tipo in ('profissional','sala','baia')),
  nome                   text not null,
  capacidade             int not null default 1 check (capacidade between 1 and 20),
  intervalo_entrada_min  int not null default 0 check (intervalo_entrada_min between 0 and 240),
  user_id                uuid references auth.users(id) on delete set null,   -- login do profissional (F2)
  cor                    text,
  ordem                  int not null default 0,
  ativo                  boolean not null default true,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  unique (id, petshop_id)
);
create trigger recursos_atualizado before update on public.recursos
  for each row execute function private.tocar_atualizado_em();

-- Quais serviços cada recurso faz. Recurso SEM nenhuma linha aqui = faz todos do seu tipo.
create table public.recurso_servicos (
  recurso_id  uuid not null,
  servico_id  uuid not null,
  petshop_id  uuid not null,
  primary key (recurso_id, servico_id),
  foreign key (recurso_id, petshop_id) references public.recursos (id, petshop_id) on delete cascade,
  foreign key (servico_id, petshop_id) references public.servicos (id, petshop_id) on delete cascade
);

-- Horário do pet shop (várias faixas por dia = intervalo de almoço). 0 = domingo.
create table public.horarios_funcionamento (
  id          uuid primary key default gen_random_uuid(),
  petshop_id  uuid not null references public.petshops(id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  abre        time not null,
  fecha       time not null,
  check (fecha > abre)
);
create index horarios_funcionamento_idx on public.horarios_funcionamento (petshop_id, dia_semana);

-- Escala do recurso (CF-09). Recurso SEM linhas aqui segue o horário do pet shop.
create table public.recurso_horarios (
  id          uuid primary key default gen_random_uuid(),
  petshop_id  uuid not null,
  recurso_id  uuid not null,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  inicio      time not null,
  fim         time not null,
  check (fim > inicio),
  foreign key (recurso_id, petshop_id) references public.recursos (id, petshop_id) on delete cascade
);
create index recurso_horarios_idx on public.recurso_horarios (recurso_id, dia_semana);

-- Bloqueios: feriado/dia fechado (recurso_id nulo = pet shop inteiro), folga, almoço, manutenção.
create table public.bloqueios (
  id          uuid primary key default gen_random_uuid(),
  petshop_id  uuid not null references public.petshops(id) on delete cascade,
  recurso_id  uuid,
  tipo        text not null default 'outro' check (tipo in ('feriado','folga','almoco','manutencao','outro')),
  inicio      timestamptz not null,
  fim         timestamptz not null,
  motivo      text,
  criado_em   timestamptz not null default now(),
  check (fim > inicio),
  foreign key (recurso_id, petshop_id) references public.recursos (id, petshop_id) on delete cascade
);
create index bloqueios_periodo_idx on public.bloqueios using gist (petshop_id, tstzrange(inicio, fim, '[)'));

-- ---------------------------------------------------------------------
-- Agendamentos
-- ---------------------------------------------------------------------
create table public.agendamentos (
  id                   uuid primary key default gen_random_uuid(),
  petshop_id           uuid not null references public.petshops(id) on delete cascade,
  pet_id               uuid not null,
  tutor_id             uuid not null,
  recurso_id           uuid not null,
  inicio               timestamptz not null,
  fim                  timestamptz not null,
  periodo              tstzrange generated always as (tstzrange(inicio, fim, '[)')) stored,
  status               text not null default 'pendente'
                         check (status in ('pendente','confirmado','em_atendimento','pronto','entregue','cancelado','no_show')),
  origem               text not null default 'manual' check (origem in ('bot','manual','site')),
  encaixe              boolean not null default false,   -- acima da capacidade, confirmado pelo dono (AG-12)
  valor_total          numeric(10,2) not null default 0, -- soma dos itens (trigger)
  pagamento_status     text not null default 'pendente' check (pagamento_status in ('pendente','parcial','pago','fiado')),
  observacoes          text,
  checkin_em           timestamptz,
  pronto_em            timestamptz,
  checkout_em          timestamptz,
  cancelado_em         timestamptz,
  motivo_cancelamento  text,
  criado_por           uuid references auth.users(id) on delete set null,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  check (fim > inicio),
  unique (id, petshop_id),
  -- O banco garante: só agenda pet e tutor VINCULADOS a este pet shop, com recurso dele.
  foreign key (pet_id, petshop_id)     references public.pet_petshop (pet_id, petshop_id),
  foreign key (tutor_id, petshop_id)   references public.tutor_petshop (tutor_id, petshop_id),
  foreign key (recurso_id, petshop_id) references public.recursos (id, petshop_id)
);
create index agendamentos_ocupacao_idx on public.agendamentos using gist (recurso_id, periodo)
  where status not in ('cancelado','no_show');
create index agendamentos_dia_idx on public.agendamentos (petshop_id, inicio);
create index agendamentos_pet_idx on public.agendamentos (pet_id, inicio desc);
create index agendamentos_tutor_idx on public.agendamentos (tutor_id, inicio desc);

alter table public.pet_eventos
  add constraint pet_eventos_agendamento_fk
  foreign key (agendamento_id) references public.agendamentos(id) on delete set null;

-- Itens do atendimento (serviço, adicional, produto, taxa): base para margem e comissão.
create table public.agendamento_itens (
  id              uuid primary key default gen_random_uuid(),
  agendamento_id  uuid not null,
  petshop_id      uuid not null,
  tipo            text not null check (tipo in ('servico','adicional','produto','taxa')),
  servico_id      uuid,
  descricao       text not null,
  quantidade      numeric(10,3) not null default 1 check (quantidade > 0),
  preco_unitario  numeric(10,2) not null check (preco_unitario >= 0),
  desconto        numeric(10,2) not null default 0 check (desconto >= 0),
  valor_total     numeric(10,2) generated always as (round(quantidade * preco_unitario - desconto, 2)) stored,
  duracao_min     int not null default 0 check (duracao_min >= 0),
  criado_em       timestamptz not null default now(),
  foreign key (agendamento_id, petshop_id) references public.agendamentos (id, petshop_id) on delete cascade,
  foreign key (servico_id, petshop_id)     references public.servicos (id, petshop_id)
);
create index agendamento_itens_ag_idx on public.agendamento_itens (agendamento_id);

create table public.pagamentos (
  id               uuid primary key default gen_random_uuid(),
  petshop_id       uuid not null,
  agendamento_id   uuid not null,
  forma            text not null check (forma in ('pix','dinheiro','debito','credito','outro')),
  valor            numeric(10,2) not null check (valor > 0),
  taxa_percentual  numeric(5,2),          -- foto da taxa no momento (para margem)
  recebido_em      timestamptz not null default now(),
  registrado_por   uuid references auth.users(id) on delete set null,
  foreign key (agendamento_id, petshop_id) references public.agendamentos (id, petshop_id) on delete cascade
);
create index pagamentos_ag_idx on public.pagamentos (agendamento_id);

create table public.lembretes (
  id              uuid primary key default gen_random_uuid(),
  petshop_id      uuid not null,
  agendamento_id  uuid not null,
  tipo            text not null default '24h' check (tipo in ('24h','2h','pos_atendimento')),
  enviado_em      timestamptz not null default now(),
  resposta        text check (resposta in ('confirmado','cancelado','sem_resposta')),
  respondido_em   timestamptz,
  unique (agendamento_id, tipo),
  foreign key (agendamento_id, petshop_id) references public.agendamentos (id, petshop_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Triggers de agenda
-- ---------------------------------------------------------------------

-- Ocupação máxima de um recurso no intervalo [inicio, fim).
-- Exata, não conservadora: 9:00–9:30 e 9:30–10:00 nunca se sobrepõem entre si,
-- então um pet de 9:00–10:00 cabe num recurso de capacidade 2.
-- O pico só pode acontecer no início do intervalo ou no início de um agendamento.
create or replace function private.carga_maxima(
  p_recurso uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar uuid default null)
returns int
language sql stable security definer set search_path = '' as $$
  with ocup as (
    select a.inicio, a.fim
      from public.agendamentos a
     where a.recurso_id = p_recurso
       and a.status not in ('cancelado','no_show')
       and a.periodo && tstzrange(p_inicio, p_fim, '[)')
       and (p_ignorar is null or a.id <> p_ignorar)
  ), pontos as (
    select p_inicio as t
    union
    select greatest(o.inicio, p_inicio) from ocup o
  )
  select coalesce(max((select count(*) from ocup o where o.inicio <= pt.t and o.fim > pt.t)), 0)::int
    from pontos pt;
$$;

-- Ciclo de status (AG-08) e carimbos de horário.
create or replace function private.agendamento_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('pendente','confirmado') then
      raise exception 'Agendamento novo começa como pendente ou confirmado' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.status = old.status then return new; end if;
  if not (
       (old.status = 'pendente'       and new.status in ('confirmado','em_atendimento','cancelado','no_show'))
    or (old.status = 'confirmado'     and new.status in ('pendente','em_atendimento','cancelado','no_show'))
    or (old.status = 'em_atendimento' and new.status in ('pronto','entregue','confirmado'))
    or (old.status = 'pronto'         and new.status in ('entregue','em_atendimento'))
    or (old.status = 'cancelado'      and new.status = 'pendente')
    or (old.status = 'no_show'        and new.status in ('pendente','confirmado'))
  ) then
    raise exception 'Transição de status inválida: % → %', old.status, new.status using errcode = '22023';
  end if;
  case new.status
    when 'em_atendimento' then new.checkin_em   := coalesce(new.checkin_em, now());
    when 'pronto'         then new.pronto_em    := coalesce(new.pronto_em, now());
    when 'entregue'       then new.checkout_em  := coalesce(new.checkout_em, now());
    when 'cancelado'      then new.cancelado_em := coalesce(new.cancelado_em, now());
    else null;
  end case;
  if old.status = 'cancelado' then new.cancelado_em := null; new.motivo_cancelamento := null; end if;
  return new;
end $$;

-- Capacidade é invariante do banco: vale para bot, painel e qualquer INSERT direto.
-- Horário de funcionamento e bloqueios são regras do MOTOR (o dono pode encaixar fora).
create or replace function private.agendamento_capacidade() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cap    int;
  v_interv int;
  v_carga  int;
begin
  new.atualizado_em := now();
  if new.status in ('cancelado','no_show') or new.encaixe then return new; end if;
  if tg_op = 'UPDATE'
     and new.inicio = old.inicio and new.fim = old.fim and new.recurso_id = old.recurso_id
     and old.status not in ('cancelado','no_show') and not old.encaixe then
    return new;   -- nada que mude a ocupação
  end if;

  select case when p.modo_capacidade = 'multiplo' then r.capacidade else 1 end,
         case when p.modo_capacidade = 'multiplo' then r.intervalo_entrada_min else 0 end
    into v_cap, v_interv
    from public.recursos r join public.petshops p on p.id = r.petshop_id
   where r.id = new.recurso_id;

  -- Serializa reservas concorrentes no mesmo recurso (bot e painel ao mesmo tempo).
  perform pg_advisory_xact_lock(hashtextextended(new.recurso_id::text, 0));

  v_carga := private.carga_maxima(new.recurso_id, new.inicio, new.fim, new.id);
  if v_carga >= v_cap then
    raise exception 'Horário indisponível: o recurso já tem % atendimento(s) simultâneo(s) (capacidade %)', v_carga, v_cap
      using errcode = '23P01', hint = 'Escolha outro horário ou marque como encaixe.';
  end if;

  if v_interv > 0 and exists (
       select 1 from public.agendamentos a
        where a.recurso_id = new.recurso_id and a.id <> new.id
          and a.status not in ('cancelado','no_show')
          and abs(extract(epoch from (a.inicio - new.inicio))) < v_interv * 60) then
    raise exception 'Entrada escalonada: precisa de % min entre o início de dois pets no mesmo profissional', v_interv
      using errcode = '23P01';
  end if;
  return new;
end $$;

-- Triggers BEFORE disparam em ordem alfabética: a_status antes de b_capacidade.
create trigger a_status     before insert or update on public.agendamentos
  for each row execute function private.agendamento_status();
create trigger b_capacidade before insert or update on public.agendamentos
  for each row execute function private.agendamento_capacidade();

-- valor_total do agendamento = soma dos itens.
create or replace function private.agendamento_recalcular_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ag uuid := coalesce(new.agendamento_id, old.agendamento_id);
begin
  update public.agendamentos a
     set valor_total = coalesce((select sum(i.valor_total) from public.agendamento_itens i
                                  where i.agendamento_id = v_ag), 0)
   where a.id = v_ag;
  return null;
end $$;
create trigger agendamento_itens_total after insert or update or delete on public.agendamento_itens
  for each row execute function private.agendamento_recalcular_total();

-- ---------------------------------------------------------------------
-- Check-in e check-out (SECURITY INVOKER: a RLS do usuário vale)
-- ---------------------------------------------------------------------
create or replace function public.fazer_checkin(p_agendamento uuid) returns public.agendamentos
language plpgsql security invoker set search_path = '' as $$
declare v public.agendamentos;
begin
  update public.agendamentos set status = 'em_atendimento'
   where id = p_agendamento returning * into v;
  if v.id is null then raise exception 'Agendamento não encontrado' using errcode = 'P0002'; end if;
  return v;
end $$;

-- EVENTO ÚNICO DE CHECK-OUT (escolha 1).
-- MVP: entrega o pet, registra pagamentos e grava o evento na linha do tempo.
-- F2: este mesmo ponto lança a receita e gera a comissão.
-- NÃO dá baixa em estoque: insumo sai pela requisição ao almoxarifado.
-- p_pagamentos: [{"forma":"pix","valor":85}, {"forma":"dinheiro","valor":20}]
create or replace function public.fazer_checkout(
  p_agendamento uuid, p_pagamentos jsonb default '[]', p_fiado boolean default false,
  p_observacao text default null)
returns public.agendamentos
language plpgsql security invoker set search_path = '' as $$
declare
  v      public.agendamentos;
  p      jsonb;
  v_pago numeric(10,2);
  v_tipo text;
begin
  update public.agendamentos set status = 'entregue'
   where id = p_agendamento returning * into v;
  if v.id is null then raise exception 'Agendamento não encontrado' using errcode = 'P0002'; end if;

  for p in select * from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) loop
    insert into public.pagamentos (petshop_id, agendamento_id, forma, valor, registrado_por)
    values (v.petshop_id, v.id, p ->> 'forma', (p ->> 'valor')::numeric, auth.uid());
  end loop;

  select coalesce(sum(valor), 0) into v_pago from public.pagamentos where agendamento_id = v.id;
  update public.agendamentos
     set pagamento_status = case
           when v_pago >= valor_total and valor_total > 0 then 'pago'
           when v_pago > 0 then 'parcial'
           when p_fiado then 'fiado'
           else 'pendente' end
   where id = v.id
   returning * into v;

  -- Tipo do evento = tipo do serviço principal (estética, consulta, vacina…)
  select s.tipo into v_tipo
    from public.agendamento_itens i join public.servicos s on s.id = i.servico_id
   where i.agendamento_id = v.id
   order by (i.tipo = 'servico') desc, i.criado_em
   limit 1;

  insert into public.pet_eventos (pet_id, petshop_id, tipo, visibilidade, ocorrido_em, agendamento_id, titulo, dados, criado_por)
  select v.pet_id, v.petshop_id, coalesce(v_tipo, 'estetica'), 'privado', now(), v.id,
         coalesce(string_agg(i.descricao, ' + ' order by (i.tipo = 'servico') desc, i.criado_em), 'Atendimento'),
         jsonb_build_object('valor_total', v.valor_total, 'recurso_id', v.recurso_id, 'observacao', p_observacao),
         auth.uid()
    from public.agendamento_itens i where i.agendamento_id = v.id;

  -- F2: perform private.lancar_receita(v.id); perform private.gerar_comissao(v.id);
  return v;
end $$;

commit;
