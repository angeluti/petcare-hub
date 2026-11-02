-- =====================================================================
-- PetCare Hub · 01 · Base comum
-- Extensões, schema privado, catálogo de planos/módulos/funcionalidades,
-- pet shops, equipe Harpia, membros do pet shop e funções de acesso.
-- Escolhas da seção 8 atendidas aqui:
--   (6) perfis de usuário por papel desde o início
--   (7) plano como liga/desliga de módulos e funcionalidades
-- =====================================================================
begin;

create extension if not exists btree_gist with schema extensions;

-- Funções auxiliares e de segurança ficam fora do schema exposto pela API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.tocar_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- Normaliza telefone brasileiro para E.164 (+55DDDNÚMERO).
create or replace function private.normalizar_telefone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d = '' then return null; end if;
  if length(d) in (10, 11) then d := '55' || d; end if;   -- DDD + número
  return '+' || d;
end $$;

-- ---------------------------------------------------------------------
-- Catálogo comercial (global, mantido pela Harpia)
-- ---------------------------------------------------------------------
create table public.planos (
  codigo                   text primary key check (codigo ~ '^[a-z_]+$'),
  nome                     text not null,
  preco_mensal             numeric(10,2) not null check (preco_mensal >= 0),
  limite_profissionais     int,            -- null = sem limite
  limite_agendamentos_mes  int,            -- null = sem limite
  plaquinhas_incluidas     int not null default 0,
  ativo                    boolean not null default true,   -- false = previsto, ainda não vendido
  ordem                    int not null default 0
);

create table public.modulos (
  codigo  text primary key check (codigo ~ '^[a-z_]+$'),   -- spa, administracao, daycare, vet, loja
  nome    text not null,
  fase    text not null check (fase in ('MVP','F2','F3','F4'))
);

create table public.funcionalidades (
  codigo            text primary key check (codigo ~ '^[a-z_]+\.[a-z_]+$'),  -- modulo.funcionalidade
  modulo_codigo     text not null references public.modulos(codigo),
  nome              text not null,
  fase              text not null check (fase in ('MVP','F2','F3','F4')),
  vendavel_avulsa   boolean not null default false
);

create table public.plano_funcionalidades (
  plano_codigo           text not null references public.planos(codigo) on delete cascade,
  funcionalidade_codigo  text not null references public.funcionalidades(codigo) on delete cascade,
  primary key (plano_codigo, funcionalidade_codigo)
);

-- ---------------------------------------------------------------------
-- Pet shops (tenant)
-- ---------------------------------------------------------------------
create table public.petshops (
  id                        uuid primary key default gen_random_uuid(),
  nome                      text not null,
  slug                      text unique check (slug ~ '^[a-z0-9-]+$'),
  telefone_wp               text unique check (telefone_wp ~ '^\+[1-9][0-9]{7,14}$'),
  endereco                  text,
  logo_url                  text,
  plano_codigo              text not null default 'starter' references public.planos(codigo),
  fuso                      text not null default 'America/Sao_Paulo',
  -- Agenda (escolha 3: recurso com capacidade)
  modo_capacidade           text not null default 'simples' check (modo_capacidade in ('simples','multiplo')),
  intervalo_slot_min        int  not null default 30 check (intervalo_slot_min in (10,15,20,30,60)),
  antecedencia_min_minutos  int  not null default 60  check (antecedencia_min_minutos >= 0),
  antecedencia_max_dias     int  not null default 30  check (antecedencia_max_dias between 1 and 365),
  cancelamento_min_horas    int  not null default 2   check (cancelamento_min_horas >= 0),
  ativo                     boolean not null default true,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);
create trigger petshops_atualizado before update on public.petshops
  for each row execute function private.tocar_atualizado_em();

-- Liga/desliga por pet shop, por cima do plano: add-on, avulsa, cortesia ou bloqueio.
create table public.petshop_funcionalidades (
  petshop_id             uuid not null references public.petshops(id) on delete cascade,
  funcionalidade_codigo  text not null references public.funcionalidades(codigo),
  ativo                  boolean not null default true,   -- false desliga mesmo se o plano inclui
  origem                 text not null check (origem in ('addon','avulsa','cortesia','bloqueio')),
  valor_mensal           numeric(10,2),
  desde                  date not null default current_date,
  ate                    date,
  primary key (petshop_id, funcionalidade_codigo)
);

-- ---------------------------------------------------------------------
-- Pessoas com login (Supabase Auth)
-- ---------------------------------------------------------------------
create table public.harpia_equipe (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  papel      text not null check (papel in ('super_admin','suporte','onboarding')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table public.petshop_membros (
  id          uuid primary key default gen_random_uuid(),
  petshop_id  uuid not null references public.petshops(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text,
  papel       text not null check (papel in ('dono','gerente','recepcao','profissional','veterinario','hospedagem')),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  unique (petshop_id, user_id)          -- um usuário pode estar em vários pet shops (rede/franquia)
);
create index petshop_membros_user_idx on public.petshop_membros (user_id) where ativo;

-- ---------------------------------------------------------------------
-- Funções de acesso usadas pelas políticas RLS.
-- SECURITY DEFINER: leem as tabelas de membros sem cair em recursão de RLS.
-- STABLE + chamadas como (select ...) nas políticas: avaliadas uma vez por query.
-- ---------------------------------------------------------------------
create or replace function private.eh_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.harpia_equipe
    where user_id = (select auth.uid()) and papel = 'super_admin' and ativo
  );
$$;

create or replace function private.meus_petshops() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select petshop_id from public.petshop_membros
  where user_id = (select auth.uid()) and ativo;
$$;

create or replace function private.petshops_com_papel(p_papeis text[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select petshop_id from public.petshop_membros
  where user_id = (select auth.uid()) and ativo and papel = any (p_papeis);
$$;

-- Papéis por intenção (um lugar só para mudar quando o F2 chegar)
create or replace function private.papeis_operacao() returns text[]
language sql immutable set search_path = '' as $$ select array['dono','gerente','recepcao','profissional','veterinario','hospedagem'] $$;
create or replace function private.papeis_config() returns text[]
language sql immutable set search_path = '' as $$ select array['dono','gerente'] $$;
create or replace function private.papeis_financeiro() returns text[]
language sql immutable set search_path = '' as $$ select array['dono','gerente'] $$;

-- Para RPCs SECURITY DEFINER: barra usuário logado sem papel no pet shop.
-- Chamadas sem usuário (secret key do N8n, SQL editor) passam: elas já são confiáveis.
create or replace function private.exigir_papel(p_petshop uuid, p_papeis text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return; end if;
  if private.eh_super_admin() then return; end if;
  if not exists (select 1 from public.petshop_membros
                 where user_id = (select auth.uid()) and petshop_id = p_petshop
                   and ativo and papel = any (p_papeis)) then
    raise exception 'Sem permissão neste pet shop' using errcode = '42501';
  end if;
end $$;

-- Plano + exceções do pet shop decidem se uma funcionalidade está ligada.
create or replace function private.tem_funcionalidade(p_petshop uuid, p_func text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select pf.ativo from public.petshop_funcionalidades pf
      where pf.petshop_id = p_petshop and pf.funcionalidade_codigo = p_func
        and pf.desde <= current_date and (pf.ate is null or pf.ate >= current_date)),
    exists (select 1 from public.petshops p
              join public.plano_funcionalidades x on x.plano_codigo = p.plano_codigo
             where p.id = p_petshop and x.funcionalidade_codigo = p_func)
  );
$$;

-- RPC para o painel montar o menu (esconder o que o plano não inclui).
create or replace function public.minhas_funcionalidades(p_petshop uuid) returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_papel(p_petshop, private.papeis_operacao());
  return query
    select f.codigo from public.funcionalidades f
    where private.tem_funcionalidade(p_petshop, f.codigo)
    order by f.codigo;
end $$;

-- Dono não troca o próprio plano nem o número do WhatsApp: só a Harpia.
create or replace function private.proteger_petshop() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.eh_super_admin() then
    if new.plano_codigo is distinct from old.plano_codigo
       or new.ativo       is distinct from old.ativo
       or new.telefone_wp is distinct from old.telefone_wp
       or new.slug        is distinct from old.slug then
      raise exception 'Plano, status, slug e número do WhatsApp só podem ser alterados pela Harpia'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger petshops_proteger before update on public.petshops
  for each row execute function private.proteger_petshop();

commit;
