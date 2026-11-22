-- =====================================================================
-- PetCare Hub · 22 · Administração: produtos, estoque por local, requisição,
-- transferência, inventário, compras, contas a pagar e a receber
-- Decisões de 22/11/2026 (chat "Administração · estoque e compras"):
--   • Cadastro único de PRODUTOS: usa_como_insumo e usa_como_venda são
--     marcações independentes (nunca um tipo exclusivo). Venda só com a Loja.
--   • Estoque e custo sempre na UNIDADE BASE (ml, g, un, cm). Embalagens
--     (galão 5 L, frasco 1 L) têm fator; cada documento guarda rótulo e fator
--     do momento.
--   • Saldo por PRODUTO × LOCAL. Estoque NUNCA negativo (CHECK + trava).
--     Custo médio ponderado por produto (não por local).
--   • Requisição de consumo: o salão pede, o almoxarifado envia e a baixa
--     acontece no ENVIO, no local de origem. O salão não tem saldo. Se faltar,
--     sai o que houver e a requisição fecha como atendida_parcial (o salão
--     pede de novo depois da compra).
--   • Devolução do salão: solicitada → aprovada (dono/gerente) → recebida na
--     confirmação física; volta pelo custo da saída original.
--   • Transferência: solicitada → aprovada (dono/gerente; nasce aprovada se
--     pedida por eles) → concluída na confirmação física. Sem reserva de
--     saldo; quem confirma informa o que moveu.
--   • Mínimo por LOCAL: não bloqueia, gera aviso de reposição com sugestão de
--     transferência.
--   • Inventário por local: a diferença é calculada sobre o saldo do momento
--     da contagem; fechar é do dono/gerente.
--   • Pedido de compra manual: rascunho → enviado → recebido_parcial →
--     recebido | encerrado | cancelado. O RECEBIMENTO é a única porta de
--     entrada de compra (com ou sem pedido) e gera as contas a pagar.
--   • Contas a pagar (FN-03) e a receber (FN-02) e categorias (FN-06).
--     Fiado do check-out é calculado de agendamentos + pagamentos (não é
--     copiado); o recebimento posterior usa receber_agendamento.
--   • Papel novo ESTOQUISTA e papéis adicionais por membro (papel principal
--     continua em petshop_membros.papel; o painel atual não muda).
--   • Custo visível só para dono, gerente e estoquista: o custo mora em
--     tabelas próprias (produto_custos, estoque_movimentos, compras).
--
-- Substitui as tabelas do F2 de estoque do arquivo 06 (vazias):
-- insumos, compras, compra_itens, requisicoes, requisicao_itens,
-- estoque_movimentos. Recria o T12 de private.rodar_testes_petcare().
-- Toca no que a POC usa (com OK de 22/11/2026): private.petshops_com_papel,
-- private.exigir_papel, public.minhas_funcionalidades (mesmo resultado para
-- quem não tem papel adicional) e grava em pagamentos/agendamentos só pela
-- RPC nova receber_agendamento.
--
-- Rode depois do 21. Idempotente.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Remove as tabelas de estoque do 06 (só se ainda forem as antigas e
--    estiverem vazias). Na 2ª aplicação nada acontece aqui.
-- ---------------------------------------------------------------------
do $$
declare n bigint;
begin
  if to_regclass('public.insumos') is not null then
    select (select count(*) from public.insumos) + (select count(*) from public.compras)
         + (select count(*) from public.requisicoes) + (select count(*) from public.estoque_movimentos)
      into n;
    if n > 0 then
      raise exception 'Arquivo 22: as tabelas de estoque do 06 têm % linha(s). Elas deveriam estar vazias; revise antes de aplicar.', n;
    end if;
    drop table public.compra_itens, public.compras, public.requisicao_itens, public.requisicoes,
               public.estoque_movimentos, public.insumos cascade;
    drop function if exists private.estoque_aplicar_movimento();
    drop function if exists private.requisicao_baixar_estoque();
    raise notice 'Arquivo 22: tabelas de estoque do 06 removidas.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Papéis: estoquista + papéis adicionais por membro
-- ---------------------------------------------------------------------
alter table public.petshop_membros drop constraint if exists petshop_membros_papel_check;
alter table public.petshop_membros add constraint petshop_membros_papel_check
  check (papel in ('dono','gerente','recepcao','profissional','veterinario','hospedagem','estoquista'));

alter table public.petshop_membros add column if not exists papeis_adicionais text[] not null default '{}';
alter table public.petshop_membros drop constraint if exists petshop_membros_papeis_adicionais_check;
alter table public.petshop_membros add constraint petshop_membros_papeis_adicionais_check
  check (papeis_adicionais <@ array['dono','gerente','recepcao','profissional','veterinario','hospedagem','estoquista']::text[]);

-- Mesmo resultado de antes para quem não tem papel adicional.
create or replace function private.petshops_com_papel(p_papeis text[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select petshop_id from public.petshop_membros
  where user_id = (select auth.uid()) and ativo
    and (papel = any (p_papeis) or papeis_adicionais && p_papeis);
$$;

create or replace function private.exigir_papel(p_petshop uuid, p_papeis text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return; end if;
  if private.eh_super_admin() then return; end if;
  if not exists (select 1 from public.petshop_membros
                 where user_id = (select auth.uid()) and petshop_id = p_petshop and ativo
                   and (papel = any (p_papeis) or papeis_adicionais && p_papeis)) then
    raise exception 'Sem permissão neste pet shop' using errcode = '42501';
  end if;
end $$;

-- Versão booleana (para decidir status sem erro).
create or replace function private.pode(p_petshop uuid, p_papeis text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is null or private.eh_super_admin()
      or exists (select 1 from public.petshop_membros
                  where user_id = (select auth.uid()) and petshop_id = p_petshop and ativo
                    and (papel = any (p_papeis) or papeis_adicionais && p_papeis));
$$;

-- Papéis por intenção (Administração)
create or replace function private.papeis_estoque() returns text[]
language sql immutable set search_path = '' as $$ select array['dono','gerente','estoquista'] $$;
create or replace function private.papeis_requisicao() returns text[]
language sql immutable set search_path = '' as $$
  select array['dono','gerente','recepcao','profissional','veterinario','hospedagem','estoquista'] $$;

-- Estoquista também abre o painel (menu).
create or replace function public.minhas_funcionalidades(p_petshop uuid) returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_papel(p_petshop, private.papeis_requisicao());
  return query
    select f.codigo from public.funcionalidades f
    where private.tem_funcionalidade(p_petshop, f.codigo)
    order by f.codigo;
end $$;

-- Papéis efetivos do usuário no pet shop (para as telas novas).
create or replace function public.meus_papeis(p_petshop uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select case when private.eh_super_admin() then array['super_admin']
         else coalesce((select array(select distinct x from unnest(array[m.papel] || m.papeis_adicionais) x order by 1)
                          from public.petshop_membros m
                         where m.user_id = (select auth.uid()) and m.petshop_id = p_petshop and m.ativo), '{}') end;
$$;

-- Papéis adicionais: só a Harpia, como os convites (revisão de acessos depois).
create or replace function public.definir_papeis_adicionais(p_membro uuid, p_papeis text[]) returns public.petshop_membros
language plpgsql security definer set search_path = '' as $$
declare v public.petshop_membros;
begin
  if (select auth.uid()) is not null and not private.eh_super_admin() then
    raise exception 'Só a equipe PetCare Hub define papéis adicionais' using errcode = '42501';
  end if;
  update public.petshop_membros m
     set papeis_adicionais = coalesce((select array(select distinct x from unnest(p_papeis) x
                                                     where x is not null and x <> m.papel order by 1)), '{}')
   where m.id = p_membro returning * into v;
  if v.id is null then raise exception 'Membro não encontrado' using errcode = 'P0002'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 2. Catálogo de funcionalidades (ligáveis por plano; distribuição no Comercial)
-- ---------------------------------------------------------------------
insert into public.funcionalidades (codigo, modulo_codigo, nome, fase, vendavel_avulsa) values
  ('administracao.contas_pagar',   'administracao', 'Contas a pagar',               'F2', false),
  ('administracao.estoque_locais', 'administracao', 'Estoque em vários locais',     'F2', true)
on conflict (codigo) do nothing;
-- Ponto de partida igual ao seed: Administração no Profissional.
insert into public.plano_funcionalidades (plano_codigo, funcionalidade_codigo)
select 'pro', c from unnest(array['administracao.contas_pagar','administracao.estoque_locais']) c
where exists (select 1 from public.planos where codigo = 'pro')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Apoio: funcionalidade exigida e numeração por pet shop
-- ---------------------------------------------------------------------
create or replace function private.exigir_funcionalidade(p_petshop uuid, p_func text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.tem_funcionalidade(p_petshop, p_func) then
    raise exception 'Funcionalidade não ligada para este pet shop: %', p_func using errcode = '42501';
  end if;
end $$;

create table if not exists public.documento_sequencias (
  petshop_id  uuid not null references public.petshops(id) on delete cascade,
  tipo        text not null,
  ultimo      int  not null default 0,
  primary key (petshop_id, tipo)
);

create or replace function private.proximo_numero(p_petshop uuid, p_tipo text) returns int
language sql security definer set search_path = '' as $$
  insert into public.documento_sequencias as s (petshop_id, tipo, ultimo) values (p_petshop, p_tipo, 1)
  on conflict (petshop_id, tipo) do update set ultimo = s.ultimo + 1
  returning ultimo;
$$;

-- ---------------------------------------------------------------------
-- 4. Tabelas
-- ---------------------------------------------------------------------

-- FN-06 · Categorias de receita e despesa (as de sistema têm código)
create table if not exists public.financeiro_categorias (
  id          uuid primary key default gen_random_uuid(),
  petshop_id  uuid not null references public.petshops(id) on delete cascade,
  tipo        text not null check (tipo in ('despesa','receita')),
  nome        text not null check (length(trim(nome)) > 0),
  codigo      text check (codigo ~ '^[a-z_]+$'),     -- só categorias de sistema
  ativo       boolean not null default true,
  unique (id, petshop_id),
  unique (petshop_id, tipo, nome),
  unique (petshop_id, codigo)
);

-- ES-08 · Fornecedores (tabela do 06, ampliada)
alter table public.fornecedores add column if not exists documento   text;
alter table public.fornecedores add column if not exists telefone    text;
alter table public.fornecedores add column if not exists email       text;
alter table public.fornecedores add column if not exists observacao  text;
alter table public.fornecedores add column if not exists criado_em   timestamptz not null default now();
create unique index if not exists fornecedores_nome_uq on public.fornecedores (petshop_id, lower(nome));

-- ES-01 · Produtos (insumo e/ou venda)
create table if not exists public.produtos (
  id                    uuid primary key default gen_random_uuid(),
  petshop_id            uuid not null references public.petshops(id) on delete cascade,
  nome                  text not null check (length(trim(nome)) > 0),
  codigo                text,                 -- SKU interno
  ean                   text check (ean ~ '^[0-9]{8,14}$'),
  categoria             text,
  marca                 text,
  usa_como_insumo       boolean not null default true,
  usa_como_venda        boolean not null default false,
  unidade_base          text not null check (unidade_base in ('ml','g','un','cm')),
  preco_venda           numeric(12,2) check (preco_venda >= 0),   -- Loja (F4)
  fornecedor_padrao_id  uuid,
  ativo                 boolean not null default true,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  check (usa_como_insumo or usa_como_venda),
  unique (id, petshop_id),
  foreign key (fornecedor_padrao_id, petshop_id) references public.fornecedores (id, petshop_id)
);
create unique index if not exists produtos_nome_uq   on public.produtos (petshop_id, lower(nome));
create unique index if not exists produtos_codigo_uq on public.produtos (petshop_id, codigo) where codigo is not null;
create unique index if not exists produtos_ean_uq    on public.produtos (petshop_id, ean) where ean is not null;

-- Custo médio (unidade base). Só dono, gerente e estoquista leem. Só o banco grava.
create table if not exists public.produto_custos (
  produto_id     uuid primary key,
  petshop_id     uuid not null,
  custo_medio    numeric(14,6) not null default 0 check (custo_medio >= 0),
  atualizado_em  timestamptz not null default now(),
  foreign key (produto_id, petshop_id) references public.produtos (id, petshop_id) on delete cascade
);

-- ES-12 · Embalagens com fator para a unidade base
create table if not exists public.produto_unidades (
  id              uuid primary key default gen_random_uuid(),
  petshop_id      uuid not null,
  produto_id      uuid not null,
  rotulo          text not null check (length(trim(rotulo)) > 0),
  fator           numeric(14,4) not null check (fator > 0),
  eh_base         boolean not null default false,
  usa_compra      boolean not null default true,
  usa_requisicao  boolean not null default true,
  ativo           boolean not null default true,
  check (not eh_base or fator = 1),
  unique (id, petshop_id),
  unique (produto_id, rotulo),
  foreign key (produto_id, petshop_id) references public.produtos (id, petshop_id) on delete cascade
);
create unique index if not exists produto_unidades_base_uq on public.produto_unidades (produto_id) where eh_base;

-- ES-13 · Locais de estoque
create table if not exists public.estoque_locais (
  id                  uuid primary key default gen_random_uuid(),
  petshop_id          uuid not null references public.petshops(id) on delete cascade,
  nome                text not null check (length(trim(nome)) > 0),
  tipo                text not null default 'almoxarifado' check (tipo in ('almoxarifado','venda','outro')),
  padrao_requisicao   boolean not null default false,   -- origem padrão da requisição
  padrao_entrada      boolean not null default false,   -- destino padrão do recebimento
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  check (not (padrao_requisicao and tipo = 'venda')),
  unique (id, petshop_id)
);
create unique index if not exists estoque_locais_nome_uq on public.estoque_locais (petshop_id, lower(nome));
create unique index if not exists estoque_locais_padrao_req_uq on public.estoque_locais (petshop_id) where padrao_requisicao;
create unique index if not exists estoque_locais_padrao_ent_uq on public.estoque_locais (petshop_id) where padrao_entrada;

-- Saldo por produto × local (cache do livro-razão; nunca negativo) + mínimo por local
create table if not exists public.estoque_saldos (
  produto_id     uuid not null,
  local_id       uuid not null,
  petshop_id     uuid not null,
  quantidade     numeric(14,4) not null default 0 check (quantidade >= 0),
  minimo         numeric(14,4) check (minimo >= 0),
  atualizado_em  timestamptz not null default now(),
  primary key (produto_id, local_id),
  foreign key (produto_id, petshop_id) references public.produtos (id, petshop_id) on delete cascade,
  foreign key (local_id, petshop_id)   references public.estoque_locais (id, petshop_id)
);
create index if not exists estoque_saldos_local_idx on public.estoque_saldos (petshop_id, local_id);

-- ES-02/03/16 · Requisição de consumo e devolução do salão
create table if not exists public.requisicoes (
  id                    uuid primary key default gen_random_uuid(),
  petshop_id            uuid not null references public.petshops(id) on delete cascade,
  numero                int  not null,
  tipo                  text not null check (tipo in ('consumo','devolucao')),
  status                text not null,
  local_id              uuid not null,       -- consumo: origem · devolução: destino
  requisicao_origem_id  uuid,                -- devolução → consumo original
  recurso_id            uuid,                -- quem/onde pediu (profissional, salão)
  observacao            text,
  motivo                text,                -- recusa ou cancelamento
  solicitado_por        uuid references auth.users(id) on delete set null,
  solicitada_em         timestamptz not null default now(),
  decidido_por          uuid references auth.users(id) on delete set null,   -- aprovou ou recusou
  decidida_em           timestamptz,
  concluido_por         uuid references auth.users(id) on delete set null,   -- enviou ou recebeu
  concluida_em          timestamptz,
  check ((tipo = 'consumo'   and status in ('pendente','atendida','atendida_parcial','recusada','cancelada') and requisicao_origem_id is null)
      or (tipo = 'devolucao' and status in ('solicitada','aprovada','recebida','recusada','cancelada') and requisicao_origem_id is not null)),
  unique (id, petshop_id),
  unique (petshop_id, numero),
  foreign key (local_id, petshop_id)             references public.estoque_locais (id, petshop_id),
  foreign key (requisicao_origem_id, petshop_id) references public.requisicoes (id, petshop_id),
  foreign key (recurso_id, petshop_id)           references public.recursos (id, petshop_id)
);
create index if not exists requisicoes_status_idx on public.requisicoes (petshop_id, status, solicitada_em desc);

create table if not exists public.requisicao_itens (
  id                  uuid primary key default gen_random_uuid(),
  petshop_id          uuid not null,
  requisicao_id       uuid not null,
  produto_id          uuid not null,
  produto_unidade_id  uuid not null,
  unidade_rotulo      text not null,
  fator               numeric(14,4) not null check (fator > 0),
  qtd_solicitada      numeric(14,4) not null check (qtd_solicitada > 0),
  qtd_atendida        numeric(14,4) check (qtd_atendida >= 0 and qtd_atendida <= qtd_solicitada),
  item_origem_id      uuid,                  -- devolução → item da requisição de consumo
  unique (id, petshop_id),
  foreign key (requisicao_id, petshop_id)      references public.requisicoes (id, petshop_id) on delete cascade,
  foreign key (produto_id, petshop_id)         references public.produtos (id, petshop_id),
  foreign key (produto_unidade_id, petshop_id) references public.produto_unidades (id, petshop_id),
  foreign key (item_origem_id, petshop_id)     references public.requisicao_itens (id, petshop_id)
);
create index if not exists requisicao_itens_req_idx on public.requisicao_itens (requisicao_id);
create index if not exists requisicao_itens_origem_idx on public.requisicao_itens (item_origem_id) where item_origem_id is not null;

-- ES-14 · Transferência entre locais
create table if not exists public.transferencias (
  id              uuid primary key default gen_random_uuid(),
  petshop_id      uuid not null references public.petshops(id) on delete cascade,
  numero          int  not null,
  origem_id       uuid not null,
  destino_id      uuid not null,
  status          text not null check (status in ('solicitada','aprovada','concluida','recusada','cancelada')),
  observacao      text,
  motivo          text,
  solicitado_por  uuid references auth.users(id) on delete set null,
  solicitada_em   timestamptz not null default now(),
  decidido_por    uuid references auth.users(id) on delete set null,
  decidida_em     timestamptz,
  concluido_por   uuid references auth.users(id) on delete set null,
  concluida_em    timestamptz,
  check (origem_id <> destino_id),
  unique (id, petshop_id),
  unique (petshop_id, numero),
  foreign key (origem_id, petshop_id)  references public.estoque_locais (id, petshop_id),
  foreign key (destino_id, petshop_id) references public.estoque_locais (id, petshop_id)
);

create table if not exists public.transferencia_itens (
  id                  uuid primary key default gen_random_uuid(),
  petshop_id          uuid not null,
  transferencia_id    uuid not null,
  produto_id          uuid not null,
  produto_unidade_id  uuid not null,
  unidade_rotulo      text not null,
  fator               numeric(14,4) not null check (fator > 0),
  qtd_solicitada      numeric(14,4) not null check (qtd_solicitada > 0),
  qtd_movida          numeric(14,4) check (qtd_movida >= 0 and qtd_movida <= qtd_solicitada),
  unique (id, petshop_id),
  foreign key (transferencia_id, petshop_id)   references public.transferencias (id, petshop_id) on delete cascade,
  foreign key (produto_id, petshop_id)         references public.produtos (id, petshop_id),
  foreign key (produto_unidade_id, petshop_id) references public.produto_unidades (id, petshop_id)
);

-- ES-06 · Inventário por local
create table if not exists public.inventarios (
  id            uuid primary key default gen_random_uuid(),
  petshop_id    uuid not null references public.petshops(id) on delete cascade,
  numero        int  not null,
  local_id      uuid not null,
  status        text not null default 'aberto' check (status in ('aberto','fechado','cancelado')),
  observacao    text,
  aberto_por    uuid references auth.users(id) on delete set null,
  aberto_em     timestamptz not null default now(),
  fechado_por   uuid references auth.users(id) on delete set null,
  fechado_em    timestamptz,
  unique (id, petshop_id),
  unique (petshop_id, numero),
  foreign key (local_id, petshop_id) references public.estoque_locais (id, petshop_id)
);
create unique index if not exists inventarios_um_aberto_uq on public.inventarios (local_id) where status = 'aberto';

create table if not exists public.inventario_itens (
  id             uuid primary key default gen_random_uuid(),
  petshop_id     uuid not null,
  inventario_id  uuid not null,
  produto_id     uuid not null,
  saldo_sistema  numeric(14,4),       -- saldo no momento da contagem (unidade base)
  qtd_contada    numeric(14,4) check (qtd_contada >= 0),
  ajuste         numeric(14,4),       -- o que de fato foi lançado ao fechar
  contado_por    uuid references auth.users(id) on delete set null,
  contado_em     timestamptz,
  unique (id, petshop_id),
  unique (inventario_id, produto_id),
  foreign key (inventario_id, petshop_id) references public.inventarios (id, petshop_id) on delete cascade,
  foreign key (produto_id, petshop_id)    references public.produtos (id, petshop_id)
);

-- ES-15 · Pedido de compra manual
create table if not exists public.pedidos_compra (
  id             uuid primary key default gen_random_uuid(),
  petshop_id     uuid not null references public.petshops(id) on delete cascade,
  numero         int  not null,
  fornecedor_id  uuid not null,
  status         text not null default 'rascunho'
                   check (status in ('rascunho','enviado','recebido_parcial','recebido','encerrado','cancelado')),
  data_prevista  date,
  observacao     text,
  motivo         text,               -- cancelamento ou encerramento
  criado_por     uuid references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now(),
  enviado_em     timestamptz,
  finalizado_em  timestamptz,        -- recebido, encerrado ou cancelado
  unique (id, petshop_id),
  unique (petshop_id, numero),
  foreign key (fornecedor_id, petshop_id) references public.fornecedores (id, petshop_id)
);

create table if not exists public.pedido_compra_itens (
  id                  uuid primary key default gen_random_uuid(),
  petshop_id          uuid not null,
  pedido_id           uuid not null,
  produto_id          uuid not null,
  produto_unidade_id  uuid not null,
  unidade_rotulo      text not null,
  fator               numeric(14,4) not null check (fator > 0),
  qtd_pedida          numeric(14,4) not null check (qtd_pedida > 0),
  custo_previsto      numeric(12,4) not null default 0 check (custo_previsto >= 0),   -- por embalagem
  qtd_recebida        numeric(14,4) not null default 0 check (qtd_recebida >= 0 and qtd_recebida <= qtd_pedida),
  unique (id, petshop_id),
  unique (pedido_id, produto_unidade_id),
  foreign key (pedido_id, petshop_id)          references public.pedidos_compra (id, petshop_id) on delete cascade,
  foreign key (produto_id, petshop_id)         references public.produtos (id, petshop_id),
  foreign key (produto_unidade_id, petshop_id) references public.produto_unidades (id, petshop_id)
);

-- ES-04 · Recebimento (única porta de entrada de compra)
create table if not exists public.recebimentos (
  id             uuid primary key default gen_random_uuid(),
  petshop_id     uuid not null references public.petshops(id) on delete cascade,
  numero         int  not null,
  pedido_id      uuid,               -- nulo = entrada avulsa
  fornecedor_id  uuid,
  local_id       uuid not null,
  recebido_em    timestamptz not null default now(),
  nf_numero      text,
  valor_total    numeric(12,2) not null default 0 check (valor_total >= 0),
  observacao     text,
  recebido_por   uuid references auth.users(id) on delete set null,
  unique (id, petshop_id),
  unique (petshop_id, numero),
  foreign key (pedido_id, petshop_id)     references public.pedidos_compra (id, petshop_id),
  foreign key (fornecedor_id, petshop_id) references public.fornecedores (id, petshop_id),
  foreign key (local_id, petshop_id)      references public.estoque_locais (id, petshop_id)
);

create table if not exists public.recebimento_itens (
  id                  uuid primary key default gen_random_uuid(),
  petshop_id          uuid not null,
  recebimento_id      uuid not null,
  pedido_item_id      uuid,
  produto_id          uuid not null,
  produto_unidade_id  uuid not null,
  unidade_rotulo      text not null,
  fator               numeric(14,4) not null check (fator > 0),
  quantidade          numeric(14,4) not null check (quantidade > 0),
  custo_unitario      numeric(12,4) not null check (custo_unitario >= 0),   -- por embalagem
  valor_total         numeric(12,2) not null,
  unique (id, petshop_id),
  foreign key (recebimento_id, petshop_id)     references public.recebimentos (id, petshop_id) on delete cascade,
  foreign key (pedido_item_id, petshop_id)     references public.pedido_compra_itens (id, petshop_id),
  foreign key (produto_id, petshop_id)         references public.produtos (id, petshop_id),
  foreign key (produto_unidade_id, petshop_id) references public.produto_unidades (id, petshop_id)
);

-- Livro-razão. Só as funções do banco inserem; ninguém edita nem apaga.
create table if not exists public.estoque_movimentos (
  id                uuid primary key default gen_random_uuid(),
  petshop_id        uuid not null,
  produto_id        uuid not null,
  local_id          uuid not null,
  tipo              text not null check (tipo in ('entrada_compra','requisicao','devolucao',
                                                 'transferencia_saida','transferencia_entrada','ajuste_inventario')),
  quantidade        numeric(14,4) not null check (quantidade <> 0),   -- unidade base, com sinal
  custo_unitario    numeric(14,6) not null check (custo_unitario >= 0),  -- unidade base
  saldo_apos        numeric(14,4) not null,
  recebimento_id    uuid,
  requisicao_id     uuid,
  transferencia_id  uuid,
  inventario_id     uuid,
  ocorrido_em       timestamptz not null default now(),
  criado_por        uuid references auth.users(id) on delete set null,
  check (num_nonnulls(recebimento_id, requisicao_id, transferencia_id, inventario_id) = 1),
  check ((tipo in ('entrada_compra','devolucao','transferencia_entrada') and quantidade > 0)
      or (tipo in ('requisicao','transferencia_saida') and quantidade < 0)
      or  tipo = 'ajuste_inventario'),
  unique (id, petshop_id),
  foreign key (produto_id, petshop_id)       references public.produtos (id, petshop_id),
  foreign key (local_id, petshop_id)         references public.estoque_locais (id, petshop_id),
  foreign key (recebimento_id, petshop_id)   references public.recebimentos (id, petshop_id),
  foreign key (requisicao_id, petshop_id)    references public.requisicoes (id, petshop_id),
  foreign key (transferencia_id, petshop_id) references public.transferencias (id, petshop_id),
  foreign key (inventario_id, petshop_id)    references public.inventarios (id, petshop_id)
);
create index if not exists estoque_movimentos_prod_idx on public.estoque_movimentos (petshop_id, produto_id, ocorrido_em);
create index if not exists estoque_movimentos_req_idx  on public.estoque_movimentos (requisicao_id) where requisicao_id is not null;

-- FN-03 · Contas a pagar (uma linha por parcela)
create table if not exists public.contas_pagar (
  id               uuid primary key default gen_random_uuid(),
  petshop_id       uuid not null references public.petshops(id) on delete cascade,
  grupo_id         uuid not null,          -- parcelas do mesmo lançamento
  parcela          int  not null default 1 check (parcela >= 1),
  parcelas         int  not null default 1 check (parcelas >= parcela),
  descricao        text not null,
  categoria_id     uuid not null,
  fornecedor_id    uuid,
  recebimento_id   uuid,
  documento        text,                   -- NF, boleto
  vencimento       date not null,
  valor            numeric(12,2) not null check (valor > 0),
  status           text not null default 'aberta' check (status in ('aberta','paga','cancelada')),
  pago_em          date,
  valor_pago       numeric(12,2) check (valor_pago >= 0),
  forma_pagamento  text check (forma_pagamento in ('pix','dinheiro','debito','credito','boleto','transferencia','outro')),
  observacao       text,
  motivo           text,
  criado_por       uuid references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now(),
  baixado_por      uuid references auth.users(id) on delete set null,
  check ((status = 'paga') = (pago_em is not null and valor_pago is not null)),
  unique (id, petshop_id),
  foreign key (categoria_id, petshop_id)   references public.financeiro_categorias (id, petshop_id),
  foreign key (fornecedor_id, petshop_id)  references public.fornecedores (id, petshop_id),
  foreign key (recebimento_id, petshop_id) references public.recebimentos (id, petshop_id)
);
create index if not exists contas_pagar_venc_idx on public.contas_pagar (petshop_id, status, vencimento);

-- FN-02 · Contas a receber (lançamentos manuais; o fiado vem dos agendamentos)
create table if not exists public.contas_receber (
  id               uuid primary key default gen_random_uuid(),
  petshop_id       uuid not null references public.petshops(id) on delete cascade,
  grupo_id         uuid not null,
  parcela          int  not null default 1 check (parcela >= 1),
  parcelas         int  not null default 1 check (parcelas >= parcela),
  descricao        text not null,
  categoria_id     uuid not null,
  tutor_id         uuid,
  documento        text,
  vencimento       date not null,
  valor            numeric(12,2) not null check (valor > 0),
  status           text not null default 'aberta' check (status in ('aberta','recebida','cancelada')),
  recebido_em      date,
  valor_recebido   numeric(12,2) check (valor_recebido >= 0),
  forma_pagamento  text check (forma_pagamento in ('pix','dinheiro','debito','credito','boleto','transferencia','outro')),
  observacao       text,
  motivo           text,
  criado_por       uuid references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now(),
  baixado_por      uuid references auth.users(id) on delete set null,
  check ((status = 'recebida') = (recebido_em is not null and valor_recebido is not null)),
  unique (id, petshop_id),
  foreign key (categoria_id, petshop_id) references public.financeiro_categorias (id, petshop_id),
  foreign key (tutor_id, petshop_id)     references public.tutor_petshop (tutor_id, petshop_id)
);
create index if not exists contas_receber_venc_idx on public.contas_receber (petshop_id, status, vencimento);

-- ---------------------------------------------------------------------
-- 5. Triggers de proteção (valem para o painel: current_user = authenticated)
--    As RPCs são SECURITY DEFINER e rodam como o dono do schema, então
--    passam livres. As triggers de proteção são SECURITY INVOKER de propósito:
--    numa função definer, current_user seria o dono e a checagem não valeria.
-- ---------------------------------------------------------------------
create or replace function private.via_painel() returns boolean
language sql stable set search_path = '' as $$ select current_user in ('authenticated','anon') $$;

-- Produto: nasce com o custo zerado e a embalagem base; unidade base não muda.
create or replace function private.produtos_antes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.unidade_base is distinct from old.unidade_base then
      raise exception 'A unidade base do produto não muda depois do cadastro' using errcode = '23514';
    end if;
    if new.petshop_id is distinct from old.petshop_id then
      raise exception 'Produto não muda de pet shop' using errcode = '42501';
    end if;
  end if;
  new.nome := trim(new.nome);
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists produtos_antes on public.produtos;
create trigger produtos_antes before insert or update on public.produtos
  for each row execute function private.produtos_antes();

create or replace function private.produtos_depois() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.produto_custos (produto_id, petshop_id) values (new.id, new.petshop_id)
  on conflict do nothing;
  insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator, eh_base)
  values (new.petshop_id, new.id, new.unidade_base, 1, true)
  on conflict do nothing;
  return null;
end $$;
drop trigger if exists produtos_depois on public.produtos;
create trigger produtos_depois after insert on public.produtos
  for each row execute function private.produtos_depois();

-- Embalagem base é do sistema: o painel não cria, não altera fator e não apaga.
create or replace function private.produto_unidades_proteger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.via_painel() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' and new.eh_base then
    raise exception 'A embalagem base é criada pelo sistema' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE','DELETE') and old.eh_base then
    if tg_op = 'DELETE' or new.fator <> old.fator or not new.eh_base or new.rotulo <> old.rotulo
       or new.produto_id <> old.produto_id or not new.ativo then
      raise exception 'A embalagem base (%) não pode ser alterada nem apagada', old.rotulo using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.eh_base or new.produto_id <> old.produto_id) and not old.eh_base then
    raise exception 'Embalagem não vira base nem muda de produto' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists produto_unidades_proteger on public.produto_unidades;
create trigger produto_unidades_proteger before insert or update or delete on public.produto_unidades
  for each row execute function private.produto_unidades_proteger();

-- Locais: vários locais exigem a funcionalidade; padrão único; não desativa com saldo.
create or replace function private.estoque_locais_antes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and exists (select 1 from public.estoque_locais l where l.petshop_id = new.petshop_id and l.ativo)
     and not private.tem_funcionalidade(new.petshop_id, 'administracao.estoque_locais') then
    raise exception 'O plano deste pet shop permite um local de estoque' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.ativo and not new.ativo then
    if exists (select 1 from public.estoque_saldos s where s.local_id = old.id and s.quantidade > 0) then
      raise exception 'O local % tem saldo; transfira ou ajuste antes de desativar', old.nome using errcode = '23514';
    end if;
    if new.padrao_requisicao or new.padrao_entrada then
      raise exception 'Defina outro local padrão antes de desativar %', old.nome using errcode = '23514';
    end if;
  end if;
  if new.padrao_requisicao and not new.ativo or new.padrao_entrada and not new.ativo then
    raise exception 'Local padrão precisa estar ativo' using errcode = '23514';
  end if;
  new.nome := trim(new.nome);
  -- O novo padrão tira o padrão do anterior.
  if new.padrao_requisicao then
    update public.estoque_locais set padrao_requisicao = false
     where petshop_id = new.petshop_id and id <> new.id and padrao_requisicao;
  end if;
  if new.padrao_entrada then
    update public.estoque_locais set padrao_entrada = false
     where petshop_id = new.petshop_id and id <> new.id and padrao_entrada;
  end if;
  return new;
end $$;
drop trigger if exists estoque_locais_antes on public.estoque_locais;
create trigger estoque_locais_antes before insert or update on public.estoque_locais
  for each row execute function private.estoque_locais_antes();

-- Pedido de compra: número automático; painel só mexe no rascunho; status só por RPC.
create or replace function private.pedidos_compra_proteger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.numero := private.proximo_numero(new.petshop_id, 'pedido_compra');
    if private.via_painel() then
      new.status := 'rascunho'; new.enviado_em := null; new.finalizado_em := null; new.motivo := null;
      new.criado_por := auth.uid(); new.criado_em := now();
    end if;
    return new;
  end if;
  if not private.via_painel() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Só pedido em rascunho pode ser apagado; use cancelar' using errcode = '42501';
    end if;
    return old;
  end if;
  if (new.status, new.numero, new.petshop_id, new.enviado_em, new.finalizado_em, new.motivo, new.criado_por, new.criado_em)
     is distinct from (old.status, old.numero, old.petshop_id, old.enviado_em, old.finalizado_em, old.motivo, old.criado_por, old.criado_em) then
    raise exception 'Status e dados de controle do pedido mudam só pelas ações (enviar, cancelar, encerrar)' using errcode = '42501';
  end if;
  if old.status <> 'rascunho' and new.fornecedor_id is distinct from old.fornecedor_id then
    raise exception 'Fornecedor só muda no rascunho' using errcode = '42501';
  end if;
  if old.status in ('recebido','encerrado','cancelado') then
    raise exception 'Pedido finalizado não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists pedidos_compra_proteger on public.pedidos_compra;
create trigger pedidos_compra_proteger before insert or update or delete on public.pedidos_compra
  for each row execute function private.pedidos_compra_proteger();

-- Itens do pedido: só no rascunho; rótulo, fator e produto vêm da embalagem.
create or replace function private.pedido_compra_itens_proteger() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status text;
  u record;
begin
  if not private.via_painel() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select p.status into v_status from public.pedidos_compra p
   where p.id = case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;
  if v_status is distinct from 'rascunho' then
    raise exception 'Itens só mudam com o pedido em rascunho' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and new.pedido_id <> old.pedido_id then
    raise exception 'Item não muda de pedido' using errcode = '42501';
  end if;
  select pu.produto_id, pu.rotulo, pu.fator, pu.ativo, pu.usa_compra, pr.ativo as produto_ativo into u
    from public.produto_unidades pu join public.produtos pr on pr.id = pu.produto_id
   where pu.id = new.produto_unidade_id and pu.petshop_id = new.petshop_id;
  if u is null or not u.ativo or not u.usa_compra or not u.produto_ativo then
    raise exception 'Embalagem inválida para compra' using errcode = '23514';
  end if;
  new.produto_id := u.produto_id; new.unidade_rotulo := u.rotulo; new.fator := u.fator;
  new.qtd_recebida := 0;
  return new;
end $$;
drop trigger if exists pedido_compra_itens_proteger on public.pedido_compra_itens;
create trigger pedido_compra_itens_proteger before insert or update or delete on public.pedido_compra_itens
  for each row execute function private.pedido_compra_itens_proteger();

-- Categorias de sistema: não somem, não mudam de tipo nem de código.
create or replace function private.financeiro_categorias_proteger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.via_painel() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then new.codigo := null; return new; end if;
  if old.codigo is not null and (tg_op = 'DELETE' or new.codigo is distinct from old.codigo
                                 or new.tipo <> old.tipo or not new.ativo) then
    raise exception 'Categoria de sistema (%) não pode ser apagada nem desativada', old.nome using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then new.codigo := old.codigo; return new; end if;
  return old;
end $$;
drop trigger if exists financeiro_categorias_proteger on public.financeiro_categorias;
create trigger financeiro_categorias_proteger before insert or update or delete on public.financeiro_categorias
  for each row execute function private.financeiro_categorias_proteger();

-- ---------------------------------------------------------------------
-- 6. Funções internas
-- ---------------------------------------------------------------------

-- Cria o almoxarifado e as categorias de sistema na primeira vez.
create or replace function private.administracao_preparar(p_petshop uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.estoque_locais where petshop_id = p_petshop) then
    insert into public.estoque_locais (petshop_id, nome, tipo, padrao_requisicao, padrao_entrada)
    values (p_petshop, 'Almoxarifado', 'almoxarifado', true, true);
  end if;
  insert into public.financeiro_categorias (petshop_id, tipo, nome, codigo)
  select p_petshop, c.tipo, c.nome, c.codigo from (values
      ('despesa','Insumos e produtos','compras'),
      ('despesa','Aluguel',null), ('despesa','Água',null), ('despesa','Energia',null),
      ('despesa','Salários e comissões',null), ('despesa','Impostos',null),
      ('despesa','Serviços contratados',null), ('despesa','Outras despesas',null),
      ('receita','Serviços','servicos'), ('receita','Venda de produtos',null), ('receita','Outras receitas',null)
    ) c(tipo, nome, codigo)
  on conflict do nothing;
end $$;

-- Movimento único do estoque: trava o produto (custo) e o saldo, nunca deixa
-- negativo, recalcula o custo médio nas entradas com custo (compra, devolução).
-- p_qtd na unidade base, com sinal. Devolve o custo unitário gravado.
create or replace function private.estoque_mover(
  p_petshop uuid, p_produto uuid, p_local uuid, p_qtd numeric, p_tipo text,
  p_custo_entrada numeric default null,
  p_recebimento uuid default null, p_requisicao uuid default null,
  p_transferencia uuid default null, p_inventario uuid default null)
returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  v_custo  numeric;
  v_saldo  numeric;
  v_total  numeric;
  v_custo_mov numeric;
  v_nome   text;
begin
  if p_qtd = 0 then return null; end if;
  insert into public.produto_custos (produto_id, petshop_id) values (p_produto, p_petshop) on conflict do nothing;
  select c.custo_medio into v_custo from public.produto_custos c
   where c.produto_id = p_produto and c.petshop_id = p_petshop for update;
  if v_custo is null then raise exception 'Produto de outro pet shop' using errcode = '42501'; end if;

  insert into public.estoque_saldos (produto_id, local_id, petshop_id) values (p_produto, p_local, p_petshop)
  on conflict do nothing;
  select s.quantidade into v_saldo from public.estoque_saldos s
   where s.produto_id = p_produto and s.local_id = p_local for update;

  if v_saldo + p_qtd < 0 then
    select nome into v_nome from public.produtos where id = p_produto;
    raise exception 'Saldo insuficiente de "%": tem %, precisa %', v_nome, v_saldo, -p_qtd using errcode = '23514';
  end if;

  if p_qtd > 0 and p_tipo in ('entrada_compra','devolucao') then
    if p_custo_entrada is null or p_custo_entrada < 0 then
      raise exception 'Entrada sem custo' using errcode = '23514';
    end if;
    select coalesce(sum(s.quantidade), 0) into v_total from public.estoque_saldos s where s.produto_id = p_produto;
    update public.produto_custos
       set custo_medio = round((v_total * v_custo + p_qtd * p_custo_entrada) / (v_total + p_qtd), 6),
           atualizado_em = now()
     where produto_id = p_produto;
    v_custo_mov := p_custo_entrada;
  else
    v_custo_mov := v_custo;
  end if;

  update public.estoque_saldos set quantidade = v_saldo + p_qtd, atualizado_em = now()
   where produto_id = p_produto and local_id = p_local;

  insert into public.estoque_movimentos (petshop_id, produto_id, local_id, tipo, quantidade, custo_unitario, saldo_apos,
                                         recebimento_id, requisicao_id, transferencia_id, inventario_id, criado_por)
  values (p_petshop, p_produto, p_local, p_tipo, p_qtd, v_custo_mov, v_saldo + p_qtd,
          p_recebimento, p_requisicao, p_transferencia, p_inventario, auth.uid());
  return v_custo_mov;
end $$;

create or replace function private.saldo(p_produto uuid, p_local uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select quantidade from public.estoque_saldos where produto_id = p_produto and local_id = p_local), 0);
$$;

-- Embalagem válida do pet shop (com o produto)
create or replace function private.embalagem(p_petshop uuid, p_unidade uuid)
returns table (produto_id uuid, rotulo text, fator numeric, usa_compra boolean, usa_requisicao boolean,
               usa_como_insumo boolean, usa_como_venda boolean, nome text)
language sql stable security definer set search_path = '' as $$
  select pu.produto_id, pu.rotulo, pu.fator, pu.usa_compra, pu.usa_requisicao,
         pr.usa_como_insumo, pr.usa_como_venda, pr.nome
    from public.produto_unidades pu join public.produtos pr on pr.id = pu.produto_id
   where pu.id = p_unidade and pu.petshop_id = p_petshop and pu.ativo and pr.ativo;
$$;

create or replace function private.local_ativo(p_petshop uuid, p_local uuid) returns public.estoque_locais
language plpgsql stable security definer set search_path = '' as $$
declare v public.estoque_locais;
begin
  select * into v from public.estoque_locais where id = p_local and petshop_id = p_petshop and ativo;
  if v.id is null then raise exception 'Local de estoque inválido ou inativo' using errcode = '23514'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 7. RPCs do painel
-- ---------------------------------------------------------------------

-- Painel chama ao abrir a Administração (cria almoxarifado e categorias).
create or replace function public.administracao_preparar(p_petshop uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_papel(p_petshop, private.papeis_requisicao());
  perform private.administracao_preparar(p_petshop);
end $$;

-- ES-05 · Mínimo por local (unidade base; nulo = sem mínimo)
create or replace function public.estoque_definir_minimo(p_produto uuid, p_local uuid, p_minimo numeric)
returns public.estoque_saldos
language plpgsql security definer set search_path = '' as $$
declare v_ps uuid; v public.estoque_saldos;
begin
  select petshop_id into v_ps from public.produtos where id = p_produto;
  if v_ps is null then raise exception 'Produto não encontrado' using errcode = 'P0002'; end if;
  perform private.exigir_papel(v_ps, private.papeis_estoque());
  perform private.exigir_funcionalidade(v_ps, 'administracao.estoque');
  perform private.local_ativo(v_ps, p_local);
  if p_minimo < 0 then raise exception 'Mínimo não pode ser negativo' using errcode = '23514'; end if;
  insert into public.estoque_saldos (produto_id, local_id, petshop_id, minimo) values (p_produto, p_local, v_ps, p_minimo)
  on conflict (produto_id, local_id) do update set minimo = excluded.minimo, atualizado_em = now()
  returning * into v;
  return v;
end $$;

-- ES-05 · Avisos de reposição (só quantidades; sem custo)
create or replace function public.estoque_avisos(p_petshop uuid, p_dias int default 30)
returns table (tipo text, produto_id uuid, produto text, unidade_base text, local_id uuid, local text,
               saldo numeric, minimo numeric, faltante numeric, cobertura jsonb, referencia uuid, ocorrido_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.exigir_papel(p_petshop, private.papeis_requisicao());
  return query
    select 'abaixo_minimo'::text, s.produto_id, p.nome, p.unidade_base, s.local_id, l.nome,
           s.quantidade, s.minimo, greatest(s.minimo - s.quantidade, 0),
           coalesce((select jsonb_agg(jsonb_build_object('local_id', o.local_id, 'local', ol.nome,
                                                         'disponivel', o.quantidade - coalesce(o.minimo, 0))
                                      order by o.quantidade - coalesce(o.minimo, 0) desc)
                       from public.estoque_saldos o join public.estoque_locais ol on ol.id = o.local_id and ol.ativo
                      where o.produto_id = s.produto_id and o.local_id <> s.local_id
                        and o.quantidade > coalesce(o.minimo, 0)), '[]'::jsonb),
           null::uuid, s.atualizado_em
      from public.estoque_saldos s
      join public.produtos p on p.id = s.produto_id and p.ativo
      join public.estoque_locais l on l.id = s.local_id and l.ativo
     where s.petshop_id = p_petshop and s.minimo is not null and s.quantidade <= s.minimo
    union all
    select 'falta_requisicao'::text, i.produto_id, p.nome, p.unidade_base, r.local_id, l.nome,
           private.saldo(i.produto_id, r.local_id), null::numeric,
           (i.qtd_solicitada - coalesce(i.qtd_atendida, 0)) * i.fator, '[]'::jsonb,
           r.id, r.concluida_em
      from public.requisicoes r
      join public.requisicao_itens i on i.requisicao_id = r.id
      join public.produtos p on p.id = i.produto_id
      join public.estoque_locais l on l.id = r.local_id
     where r.petshop_id = p_petshop and r.tipo = 'consumo' and r.status = 'atendida_parcial'
       and r.concluida_em >= now() - make_interval(days => p_dias)
       and coalesce(i.qtd_atendida, 0) < i.qtd_solicitada;
end $$;

-- ES-02 · Requisição de consumo. p_itens: [{produto_unidade_id, quantidade}]
create or replace function public.requisicao_criar(
  p_petshop uuid, p_itens jsonb, p_local uuid default null, p_recurso uuid default null, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_local public.estoque_locais;
  v_id uuid;
  it jsonb;
  e record;
  v_qtd numeric;
begin
  perform private.exigir_papel(p_petshop, private.papeis_requisicao());
  perform private.exigir_funcionalidade(p_petshop, 'administracao.almoxarifado');
  perform private.administracao_preparar(p_petshop);
  if p_local is null then
    select * into v_local from public.estoque_locais where petshop_id = p_petshop and padrao_requisicao and ativo;
    if v_local.id is null then raise exception 'Defina o local padrão da requisição' using errcode = '23514'; end if;
  else
    v_local := private.local_ativo(p_petshop, p_local);
  end if;
  if v_local.tipo = 'venda' then
    raise exception 'Requisição não sai do local de venda; peça uma transferência' using errcode = '23514';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Requisição sem itens' using errcode = '23514';
  end if;

  insert into public.requisicoes (petshop_id, numero, tipo, status, local_id, recurso_id, observacao, solicitado_por)
  values (p_petshop, private.proximo_numero(p_petshop, 'requisicao'), 'consumo', 'pendente', v_local.id,
          p_recurso, nullif(trim(p_observacao), ''), auth.uid())
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_itens) loop
    select * into e from private.embalagem(p_petshop, (it ->> 'produto_unidade_id')::uuid);
    v_qtd := (it ->> 'quantidade')::numeric;
    if e.produto_id is null or not e.usa_requisicao or not e.usa_como_insumo then
      raise exception 'Item inválido na requisição (produto inativo, não é insumo ou embalagem não usada em requisição)' using errcode = '23514';
    end if;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para "%"', e.nome using errcode = '23514'; end if;
    insert into public.requisicao_itens (petshop_id, requisicao_id, produto_id, produto_unidade_id, unidade_rotulo, fator, qtd_solicitada)
    values (p_petshop, v_id, e.produto_id, (it ->> 'produto_unidade_id')::uuid, e.rotulo, e.fator, v_qtd);
  end loop;
  return v_id;
end $$;

-- ES-03 · Envio pelo almoxarifado = baixa. p_itens opcional: [{item_id, quantidade}]
-- Sem p_itens: envia o que houver (até o pedido). Devolve o resumo e os faltantes.
create or replace function public.requisicao_atender(p_requisicao uuid, p_itens jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.requisicoes;
  i public.requisicao_itens;
  v_saldo numeric;
  v_max numeric;
  v_qtd numeric;
  v_inf numeric;
  v_parcial boolean := false;
  v_res jsonb := '[]'::jsonb;
begin
  select * into r from public.requisicoes where id = p_requisicao for update;
  if r.id is null then raise exception 'Requisição não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(r.petshop_id, private.papeis_estoque());
  perform private.exigir_funcionalidade(r.petshop_id, 'administracao.almoxarifado');
  if r.tipo <> 'consumo' or r.status <> 'pendente' then
    raise exception 'Só requisição de consumo pendente pode ser atendida (status: %)', r.status using errcode = '23514';
  end if;

  for i in select * from public.requisicao_itens where requisicao_id = r.id order by id loop
    v_saldo := private.saldo(i.produto_id, r.local_id);
    v_max := trunc(v_saldo / i.fator, 4);
    v_inf := (select (x ->> 'quantidade')::numeric from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
               where (x ->> 'item_id')::uuid = i.id limit 1);
    if v_inf is not null then
      if v_inf < 0 or v_inf > i.qtd_solicitada then
        raise exception 'Quantidade enviada fora do pedido (0 a %)', i.qtd_solicitada using errcode = '23514';
      end if;
      if v_inf > v_max then
        raise exception 'Saldo insuficiente: o local tem % %', v_max, i.unidade_rotulo using errcode = '23514';
      end if;
      v_qtd := v_inf;
    else
      v_qtd := least(i.qtd_solicitada, v_max);
    end if;
    if v_qtd > 0 then
      perform private.estoque_mover(r.petshop_id, i.produto_id, r.local_id, -(v_qtd * i.fator), 'requisicao',
                                    p_requisicao => r.id);
    end if;
    update public.requisicao_itens set qtd_atendida = v_qtd where id = i.id;
    if v_qtd < i.qtd_solicitada then v_parcial := true; end if;
    v_res := v_res || jsonb_build_object('item_id', i.id, 'produto_id', i.produto_id, 'unidade', i.unidade_rotulo,
                                         'solicitada', i.qtd_solicitada, 'atendida', v_qtd,
                                         'faltante', i.qtd_solicitada - v_qtd);
  end loop;

  update public.requisicoes
     set status = case when v_parcial then 'atendida_parcial' else 'atendida' end,
         concluido_por = auth.uid(), concluida_em = now()
   where id = r.id;
  return jsonb_build_object('requisicao_id', r.id, 'status', case when v_parcial then 'atendida_parcial' else 'atendida' end,
                            'precisa_comprar', v_parcial, 'itens', v_res);
end $$;

-- Recusa: consumo pendente (almoxarifado) ou devolução solicitada/aprovada (dono/gerente).
create or replace function public.requisicao_recusar(p_requisicao uuid, p_motivo text)
returns public.requisicoes
language plpgsql security definer set search_path = '' as $$
declare r public.requisicoes;
begin
  select * into r from public.requisicoes where id = p_requisicao for update;
  if r.id is null then raise exception 'Requisição não encontrada' using errcode = 'P0002'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo da recusa' using errcode = '23514'; end if;
  if r.tipo = 'consumo' and r.status = 'pendente' then
    perform private.exigir_papel(r.petshop_id, private.papeis_estoque());
  elsif r.tipo = 'devolucao' and r.status in ('solicitada','aprovada') then
    perform private.exigir_papel(r.petshop_id, private.papeis_config());
  else
    raise exception 'Esta requisição não pode ser recusada (status: %)', r.status using errcode = '23514';
  end if;
  update public.requisicoes set status = 'recusada', motivo = trim(p_motivo), decidido_por = auth.uid(), decidida_em = now()
   where id = r.id returning * into r;
  return r;
end $$;

-- Cancelamento por quem pediu (ou dono/gerente), antes do envio/recebimento.
create or replace function public.requisicao_cancelar(p_requisicao uuid, p_motivo text default null)
returns public.requisicoes
language plpgsql security definer set search_path = '' as $$
declare r public.requisicoes;
begin
  select * into r from public.requisicoes where id = p_requisicao for update;
  if r.id is null then raise exception 'Requisição não encontrada' using errcode = 'P0002'; end if;
  if r.status not in ('pendente','solicitada','aprovada') then
    raise exception 'Esta requisição não pode ser cancelada (status: %)', r.status using errcode = '23514';
  end if;
  if not (r.solicitado_por is not distinct from auth.uid() and private.pode(r.petshop_id, private.papeis_requisicao()))
     and not private.pode(r.petshop_id, private.papeis_config()) then
    raise exception 'Só quem pediu, o dono ou o gerente cancelam' using errcode = '42501';
  end if;
  update public.requisicoes set status = 'cancelada', motivo = nullif(trim(p_motivo), '')
   where id = r.id returning * into r;
  return r;
end $$;

-- ES-16 · Devolução do salão. p_itens: [{item_origem_id, quantidade}] na embalagem da requisição original.
create or replace function public.devolucao_criar(p_requisicao_origem uuid, p_itens jsonb, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.requisicoes;
  io public.requisicao_itens;
  it jsonb;
  v_id uuid;
  v_qtd numeric;
  v_ja numeric;
begin
  select * into o from public.requisicoes where id = p_requisicao_origem for update;
  if o.id is null then raise exception 'Requisição não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(o.petshop_id, private.papeis_requisicao());
  perform private.exigir_funcionalidade(o.petshop_id, 'administracao.almoxarifado');
  if o.tipo <> 'consumo' or o.status not in ('atendida','atendida_parcial') then
    raise exception 'Só se devolve de uma requisição de consumo atendida' using errcode = '23514';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Devolução sem itens' using errcode = '23514';
  end if;
  perform private.local_ativo(o.petshop_id, o.local_id);

  insert into public.requisicoes (petshop_id, numero, tipo, status, local_id, requisicao_origem_id, recurso_id, observacao, solicitado_por)
  values (o.petshop_id, private.proximo_numero(o.petshop_id, 'requisicao'), 'devolucao', 'solicitada', o.local_id, o.id,
          o.recurso_id, nullif(trim(p_observacao), ''), auth.uid())
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_itens) loop
    select * into io from public.requisicao_itens where id = (it ->> 'item_origem_id')::uuid and requisicao_id = o.id;
    v_qtd := (it ->> 'quantidade')::numeric;
    if io.id is null then raise exception 'Item não pertence à requisição de origem' using errcode = '23514'; end if;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida' using errcode = '23514'; end if;
    select coalesce(sum(case when d.status = 'recebida' then di.qtd_atendida else di.qtd_solicitada end), 0) into v_ja
      from public.requisicao_itens di join public.requisicoes d on d.id = di.requisicao_id
     where di.item_origem_id = io.id and d.status in ('solicitada','aprovada','recebida');
    if v_qtd > coalesce(io.qtd_atendida, 0) - v_ja then
      raise exception 'Devolução acima do enviado: ainda pode devolver % %', coalesce(io.qtd_atendida, 0) - v_ja, io.unidade_rotulo
        using errcode = '23514';
    end if;
    insert into public.requisicao_itens (petshop_id, requisicao_id, produto_id, produto_unidade_id, unidade_rotulo, fator,
                                         qtd_solicitada, item_origem_id)
    values (o.petshop_id, v_id, io.produto_id, io.produto_unidade_id, io.unidade_rotulo, io.fator, v_qtd, io.id);
  end loop;
  return v_id;
end $$;

create or replace function public.devolucao_aprovar(p_requisicao uuid)
returns public.requisicoes
language plpgsql security definer set search_path = '' as $$
declare r public.requisicoes;
begin
  select * into r from public.requisicoes where id = p_requisicao for update;
  if r.id is null then raise exception 'Requisição não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(r.petshop_id, private.papeis_config());
  if r.tipo <> 'devolucao' or r.status <> 'solicitada' then
    raise exception 'Só devolução solicitada pode ser aprovada (status: %)', r.status using errcode = '23514';
  end if;
  update public.requisicoes set status = 'aprovada', decidido_por = auth.uid(), decidida_em = now()
   where id = r.id returning * into r;
  return r;
end $$;

-- Confirmação física da devolução: volta ao estoque pelo custo da saída original.
-- p_itens opcional: [{item_id, quantidade}] (o que de fato voltou; até o aprovado).
create or replace function public.devolucao_receber(p_requisicao uuid, p_itens jsonb default null)
returns public.requisicoes
language plpgsql security definer set search_path = '' as $$
declare
  r public.requisicoes;
  i public.requisicao_itens;
  v_qtd numeric;
  v_inf numeric;
  v_custo numeric;
begin
  select * into r from public.requisicoes where id = p_requisicao for update;
  if r.id is null then raise exception 'Requisição não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(r.petshop_id, private.papeis_estoque());
  if r.tipo <> 'devolucao' or r.status <> 'aprovada' then
    raise exception 'Só devolução aprovada pode ser recebida (status: %)', r.status using errcode = '23514';
  end if;
  perform private.local_ativo(r.petshop_id, r.local_id);
  for i in select * from public.requisicao_itens where requisicao_id = r.id order by id loop
    v_inf := (select (x ->> 'quantidade')::numeric from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
               where (x ->> 'item_id')::uuid = i.id limit 1);
    v_qtd := coalesce(v_inf, i.qtd_solicitada);
    if v_qtd < 0 or v_qtd > i.qtd_solicitada then
      raise exception 'Quantidade recebida fora do aprovado (0 a %)', i.qtd_solicitada using errcode = '23514';
    end if;
    if v_qtd > 0 then
      select m.custo_unitario into v_custo from public.estoque_movimentos m
       where m.requisicao_id = r.requisicao_origem_id and m.produto_id = i.produto_id and m.tipo = 'requisicao'
       order by m.ocorrido_em limit 1;
      if v_custo is null then
        select custo_medio into v_custo from public.produto_custos where produto_id = i.produto_id;
      end if;
      perform private.estoque_mover(r.petshop_id, i.produto_id, r.local_id, v_qtd * i.fator, 'devolucao', v_custo,
                                    p_requisicao => r.id);
    end if;
    update public.requisicao_itens set qtd_atendida = v_qtd where id = i.id;
  end loop;
  update public.requisicoes set status = 'recebida', concluido_por = auth.uid(), concluida_em = now()
   where id = r.id returning * into r;
  return r;
end $$;

-- ES-14 · Transferência. p_itens: [{produto_unidade_id, quantidade}]
create or replace function public.transferencia_criar(
  p_petshop uuid, p_origem uuid, p_destino uuid, p_itens jsonb, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ori public.estoque_locais;
  v_des public.estoque_locais;
  v_id uuid;
  v_aprov boolean;
  it jsonb;
  e record;
  v_qtd numeric;
begin
  perform private.exigir_papel(p_petshop, private.papeis_requisicao());
  perform private.exigir_funcionalidade(p_petshop, 'administracao.estoque');
  v_ori := private.local_ativo(p_petshop, p_origem);
  v_des := private.local_ativo(p_petshop, p_destino);
  if v_ori.id = v_des.id then raise exception 'Origem e destino iguais' using errcode = '23514'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Transferência sem itens' using errcode = '23514';
  end if;
  v_aprov := private.pode(p_petshop, private.papeis_config());

  insert into public.transferencias (petshop_id, numero, origem_id, destino_id, status, observacao, solicitado_por,
                                     decidido_por, decidida_em)
  values (p_petshop, private.proximo_numero(p_petshop, 'transferencia'), v_ori.id, v_des.id,
          case when v_aprov then 'aprovada' else 'solicitada' end, nullif(trim(p_observacao), ''), auth.uid(),
          case when v_aprov then auth.uid() end, case when v_aprov then now() end)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_itens) loop
    select * into e from private.embalagem(p_petshop, (it ->> 'produto_unidade_id')::uuid);
    v_qtd := (it ->> 'quantidade')::numeric;
    if e.produto_id is null then raise exception 'Item inválido na transferência' using errcode = '23514'; end if;
    if v_des.tipo = 'venda' and not e.usa_como_venda then
      raise exception '"%" não está marcado como produto de venda', e.nome using errcode = '23514';
    end if;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para "%"', e.nome using errcode = '23514'; end if;
    insert into public.transferencia_itens (petshop_id, transferencia_id, produto_id, produto_unidade_id, unidade_rotulo, fator, qtd_solicitada)
    values (p_petshop, v_id, e.produto_id, (it ->> 'produto_unidade_id')::uuid, e.rotulo, e.fator, v_qtd);
  end loop;
  return v_id;
end $$;

create or replace function public.transferencia_decidir(p_transferencia uuid, p_aprovar boolean, p_motivo text default null)
returns public.transferencias
language plpgsql security definer set search_path = '' as $$
declare t public.transferencias;
begin
  select * into t from public.transferencias where id = p_transferencia for update;
  if t.id is null then raise exception 'Transferência não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(t.petshop_id, private.papeis_config());
  if p_aprovar and t.status <> 'solicitada' then
    raise exception 'Só transferência solicitada pode ser aprovada (status: %)', t.status using errcode = '23514';
  end if;
  if not p_aprovar then
    if t.status not in ('solicitada','aprovada') then
      raise exception 'Esta transferência não pode ser recusada (status: %)', t.status using errcode = '23514';
    end if;
    if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo da recusa' using errcode = '23514'; end if;
  end if;
  update public.transferencias
     set status = case when p_aprovar then 'aprovada' else 'recusada' end,
         motivo = case when p_aprovar then motivo else trim(p_motivo) end,
         decidido_por = auth.uid(), decidida_em = now()
   where id = t.id returning * into t;
  return t;
end $$;

create or replace function public.transferencia_cancelar(p_transferencia uuid, p_motivo text default null)
returns public.transferencias
language plpgsql security definer set search_path = '' as $$
declare t public.transferencias;
begin
  select * into t from public.transferencias where id = p_transferencia for update;
  if t.id is null then raise exception 'Transferência não encontrada' using errcode = 'P0002'; end if;
  if t.status not in ('solicitada','aprovada') then
    raise exception 'Esta transferência não pode ser cancelada (status: %)', t.status using errcode = '23514';
  end if;
  if not (t.solicitado_por is not distinct from auth.uid() and private.pode(t.petshop_id, private.papeis_requisicao()))
     and not private.pode(t.petshop_id, private.papeis_config()) then
    raise exception 'Só quem pediu, o dono ou o gerente cancelam' using errcode = '42501';
  end if;
  update public.transferencias set status = 'cancelada', motivo = nullif(trim(p_motivo), '')
   where id = t.id returning * into t;
  return t;
end $$;

-- Confirmação física: só aqui o estoque se move. Sem reserva na aprovação:
-- quem confirma informa o que moveu (até o aprovado e até o saldo da origem).
create or replace function public.transferencia_confirmar(p_transferencia uuid, p_itens jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.transferencias;
  i public.transferencia_itens;
  v_des public.estoque_locais;
  v_max numeric;
  v_inf numeric;
  v_qtd numeric;
  v_parcial boolean := false;
  v_res jsonb := '[]'::jsonb;
begin
  select * into t from public.transferencias where id = p_transferencia for update;
  if t.id is null then raise exception 'Transferência não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(t.petshop_id, private.papeis_estoque());
  if t.status <> 'aprovada' then
    raise exception 'Só transferência aprovada pode ser confirmada (status: %)', t.status using errcode = '23514';
  end if;
  perform private.local_ativo(t.petshop_id, t.origem_id);
  v_des := private.local_ativo(t.petshop_id, t.destino_id);
  for i in select * from public.transferencia_itens where transferencia_id = t.id order by id loop
    v_max := trunc(private.saldo(i.produto_id, t.origem_id) / i.fator, 4);
    v_inf := (select (x ->> 'quantidade')::numeric from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
               where (x ->> 'item_id')::uuid = i.id limit 1);
    if v_inf is not null then
      if v_inf < 0 or v_inf > i.qtd_solicitada then
        raise exception 'Quantidade movida fora do aprovado (0 a %)', i.qtd_solicitada using errcode = '23514';
      end if;
      if v_inf > v_max then
        raise exception 'Saldo insuficiente na origem: tem % %', v_max, i.unidade_rotulo using errcode = '23514';
      end if;
      v_qtd := v_inf;
    else
      v_qtd := least(i.qtd_solicitada, v_max);
    end if;
    if v_qtd > 0 then
      perform private.estoque_mover(t.petshop_id, i.produto_id, t.origem_id, -(v_qtd * i.fator), 'transferencia_saida',
                                    p_transferencia => t.id);
      perform private.estoque_mover(t.petshop_id, i.produto_id, t.destino_id, v_qtd * i.fator, 'transferencia_entrada',
                                    p_transferencia => t.id);
    end if;
    update public.transferencia_itens set qtd_movida = v_qtd where id = i.id;
    if v_qtd < i.qtd_solicitada then v_parcial := true; end if;
    v_res := v_res || jsonb_build_object('item_id', i.id, 'produto_id', i.produto_id, 'unidade', i.unidade_rotulo,
                                         'aprovada', i.qtd_solicitada, 'movida', v_qtd, 'faltante', i.qtd_solicitada - v_qtd);
  end loop;
  update public.transferencias set status = 'concluida', concluido_por = auth.uid(), concluida_em = now() where id = t.id;
  return jsonb_build_object('transferencia_id', t.id, 'status', 'concluida', 'parcial', v_parcial, 'itens', v_res);
end $$;

-- ES-06 · Inventário
create or replace function public.inventario_abrir(p_petshop uuid, p_local uuid, p_produtos uuid[] default null,
                                                   p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.exigir_papel(p_petshop, private.papeis_estoque());
  perform private.exigir_funcionalidade(p_petshop, 'administracao.estoque');
  perform private.local_ativo(p_petshop, p_local);
  if exists (select 1 from public.inventarios where local_id = p_local and status = 'aberto') then
    raise exception 'Já existe um inventário aberto neste local' using errcode = '23505';
  end if;
  insert into public.inventarios (petshop_id, numero, local_id, observacao, aberto_por)
  values (p_petshop, private.proximo_numero(p_petshop, 'inventario'), p_local, nullif(trim(p_observacao), ''), auth.uid())
  returning id into v_id;
  insert into public.inventario_itens (petshop_id, inventario_id, produto_id)
  select p_petshop, v_id, p.id from public.produtos p
   where p.petshop_id = p_petshop and p.ativo
     and (case when p_produtos is null
               then exists (select 1 from public.estoque_saldos s where s.produto_id = p.id and s.local_id = p_local)
               else p.id = any (p_produtos) end);
  return v_id;
end $$;

-- Contagem: p_itens [{produto_unidade_id, quantidade}] (somados por produto).
-- Guarda o saldo do sistema no momento da contagem.
create or replace function public.inventario_contar(p_inventario uuid, p_itens jsonb)
returns setof public.inventario_itens
language plpgsql security definer set search_path = '' as $$
declare
  inv public.inventarios;
  x record;
begin
  select * into inv from public.inventarios where id = p_inventario for update;
  if inv.id is null then raise exception 'Inventário não encontrado' using errcode = 'P0002'; end if;
  perform private.exigir_papel(inv.petshop_id, private.papeis_estoque());
  if inv.status <> 'aberto' then raise exception 'Inventário não está aberto' using errcode = '23514'; end if;
  for x in
    select e.produto_id, sum((it ->> 'quantidade')::numeric * e.fator) as base, bool_and((it ->> 'quantidade')::numeric >= 0) as ok
      from jsonb_array_elements(p_itens) it
      left join lateral private.embalagem(inv.petshop_id, (it ->> 'produto_unidade_id')::uuid) e on true
     group by e.produto_id
  loop
    if x.produto_id is null or not x.ok then raise exception 'Item de contagem inválido' using errcode = '23514'; end if;
    insert into public.inventario_itens (petshop_id, inventario_id, produto_id, saldo_sistema, qtd_contada, contado_por, contado_em)
    values (inv.petshop_id, inv.id, x.produto_id, private.saldo(x.produto_id, inv.local_id), x.base, auth.uid(), now())
    on conflict (inventario_id, produto_id) do update
      set saldo_sistema = excluded.saldo_sistema, qtd_contada = excluded.qtd_contada,
          contado_por = excluded.contado_por, contado_em = excluded.contado_em;
  end loop;
  return query select * from public.inventario_itens where inventario_id = inv.id order by contado_em nulls last;
end $$;

-- Fechar (dono/gerente): ajusta pela diferença da contagem; nunca abaixo de zero.
create or replace function public.inventario_fechar(p_inventario uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  inv public.inventarios;
  i public.inventario_itens;
  v_atual numeric;
  v_mov numeric;
  v_custo numeric;
  v_valor numeric := 0;
  n int := 0;
begin
  select * into inv from public.inventarios where id = p_inventario for update;
  if inv.id is null then raise exception 'Inventário não encontrado' using errcode = 'P0002'; end if;
  perform private.exigir_papel(inv.petshop_id, private.papeis_config());
  if inv.status <> 'aberto' then raise exception 'Inventário não está aberto' using errcode = '23514'; end if;
  for i in select * from public.inventario_itens where inventario_id = inv.id and qtd_contada is not null loop
    v_atual := private.saldo(i.produto_id, inv.local_id);
    v_mov := greatest(v_atual + (i.qtd_contada - i.saldo_sistema), 0) - v_atual;
    if v_mov <> 0 then
      v_custo := private.estoque_mover(inv.petshop_id, i.produto_id, inv.local_id, v_mov, 'ajuste_inventario',
                                       p_inventario => inv.id);
      v_valor := v_valor + v_mov * v_custo;
      n := n + 1;
    end if;
    update public.inventario_itens set ajuste = v_mov where id = i.id;
  end loop;
  update public.inventarios set status = 'fechado', fechado_por = auth.uid(), fechado_em = now() where id = inv.id;
  return jsonb_build_object('inventario_id', inv.id, 'itens_ajustados', n, 'valor_ajuste', round(v_valor, 2));
end $$;

create or replace function public.inventario_cancelar(p_inventario uuid)
returns public.inventarios
language plpgsql security definer set search_path = '' as $$
declare inv public.inventarios;
begin
  select * into inv from public.inventarios where id = p_inventario for update;
  if inv.id is null then raise exception 'Inventário não encontrado' using errcode = 'P0002'; end if;
  perform private.exigir_papel(inv.petshop_id, private.papeis_estoque());
  if inv.status <> 'aberto' then raise exception 'Inventário não está aberto' using errcode = '23514'; end if;
  update public.inventarios set status = 'cancelado', fechado_por = auth.uid(), fechado_em = now()
   where id = inv.id returning * into inv;
  return inv;
end $$;

-- ES-15 · Ações do pedido de compra
create or replace function public.pedido_compra_enviar(p_pedido uuid)
returns public.pedidos_compra
language plpgsql security definer set search_path = '' as $$
declare p public.pedidos_compra;
begin
  select * into p from public.pedidos_compra where id = p_pedido for update;
  if p.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  perform private.exigir_papel(p.petshop_id, private.papeis_estoque());
  perform private.exigir_funcionalidade(p.petshop_id, 'administracao.compras');
  if p.status <> 'rascunho' then raise exception 'Só pedido em rascunho pode ser enviado' using errcode = '23514'; end if;
  if not exists (select 1 from public.pedido_compra_itens where pedido_id = p.id) then
    raise exception 'Pedido sem itens' using errcode = '23514';
  end if;
  update public.pedidos_compra set status = 'enviado', enviado_em = now() where id = p.id returning * into p;
  return p;
end $$;

create or replace function public.pedido_compra_cancelar(p_pedido uuid, p_motivo text)
returns public.pedidos_compra
language plpgsql security definer set search_path = '' as $$
declare p public.pedidos_compra;
begin
  select * into p from public.pedidos_compra where id = p_pedido for update;
  if p.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  perform private.exigir_papel(p.petshop_id, private.papeis_estoque());
  if p.status not in ('rascunho','enviado') then
    raise exception 'Pedido com recebimento não é cancelado; use encerrar' using errcode = '23514';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '23514'; end if;
  update public.pedidos_compra set status = 'cancelado', motivo = trim(p_motivo), finalizado_em = now()
   where id = p.id returning * into p;
  return p;
end $$;

create or replace function public.pedido_compra_encerrar(p_pedido uuid, p_motivo text)
returns public.pedidos_compra
language plpgsql security definer set search_path = '' as $$
declare p public.pedidos_compra;
begin
  select * into p from public.pedidos_compra where id = p_pedido for update;
  if p.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  perform private.exigir_papel(p.petshop_id, private.papeis_estoque());
  if p.status <> 'recebido_parcial' then
    raise exception 'Só pedido recebido em parte pode ser encerrado' using errcode = '23514';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '23514'; end if;
  update public.pedidos_compra set status = 'encerrado', motivo = trim(p_motivo), finalizado_em = now()
   where id = p.id returning * into p;
  return p;
end $$;

-- ES-04 · Recebimento de compra (com ou sem pedido) → entrada + contas a pagar.
-- Com pedido:  p_itens [{pedido_item_id, quantidade, custo_unitario?}]  (custo por embalagem)
-- Sem pedido:  p_itens [{produto_unidade_id, quantidade, custo_unitario}]
-- p_parcelas:  [{vencimento, valor}]; sem parcelas = uma só, vencendo no dia do recebimento.
create or replace function public.compra_receber(
  p_petshop uuid, p_itens jsonb, p_pedido uuid default null, p_fornecedor uuid default null,
  p_local uuid default null, p_nf text default null, p_recebido_em timestamptz default now(),
  p_parcelas jsonb default null, p_observacao text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ped public.pedidos_compra;
  pi  public.pedido_compra_itens;
  v_local public.estoque_locais;
  v_forn uuid;
  v_rec uuid;
  v_num int;
  v_total numeric := 0;
  v_status text;
  v_grupo uuid := gen_random_uuid();
  v_cat uuid;
  v_n int;
  v_k int := 0;
  v_soma numeric;
  v_contas uuid[] := '{}';
  v_cid uuid;
  it jsonb;
  pc jsonb;
  e record;
  v_qtd numeric;
  v_custo numeric;
  v_unid uuid;
  v_pitem uuid;
  v_valor numeric;
begin
  perform private.exigir_papel(p_petshop, private.papeis_estoque());
  perform private.exigir_funcionalidade(p_petshop, 'administracao.compras');
  perform private.administracao_preparar(p_petshop);
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Recebimento sem itens' using errcode = '23514';
  end if;

  if p_pedido is not null then
    select * into ped from public.pedidos_compra where id = p_pedido and petshop_id = p_petshop for update;
    if ped.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
    if ped.status not in ('enviado','recebido_parcial') then
      raise exception 'Pedido não está aguardando recebimento (status: %)', ped.status using errcode = '23514';
    end if;
    if p_fornecedor is not null and p_fornecedor <> ped.fornecedor_id then
      raise exception 'Fornecedor diferente do pedido' using errcode = '23514';
    end if;
    v_forn := ped.fornecedor_id;
  else
    v_forn := p_fornecedor;
    if v_forn is not null and not exists (select 1 from public.fornecedores where id = v_forn and petshop_id = p_petshop) then
      raise exception 'Fornecedor inválido' using errcode = '23514';
    end if;
  end if;

  if p_local is null then
    select * into v_local from public.estoque_locais where petshop_id = p_petshop and padrao_entrada and ativo;
    if v_local.id is null then raise exception 'Defina o local padrão de entrada' using errcode = '23514'; end if;
  else
    v_local := private.local_ativo(p_petshop, p_local);
  end if;

  v_num := private.proximo_numero(p_petshop, 'recebimento');
  insert into public.recebimentos (petshop_id, numero, pedido_id, fornecedor_id, local_id, recebido_em, nf_numero, observacao, recebido_por)
  values (p_petshop, v_num, p_pedido, v_forn, v_local.id, coalesce(p_recebido_em, now()), nullif(trim(p_nf), ''),
          nullif(trim(p_observacao), ''), auth.uid())
  returning id into v_rec;

  for it in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (it ->> 'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida no recebimento' using errcode = '23514'; end if;
    if p_pedido is not null then
      select * into pi from public.pedido_compra_itens
       where id = (it ->> 'pedido_item_id')::uuid and pedido_id = p_pedido for update;
      if pi.id is null then raise exception 'Item não pertence ao pedido' using errcode = '23514'; end if;
      if v_qtd > pi.qtd_pedida - pi.qtd_recebida then
        raise exception 'Recebimento acima do pedido: faltam % %', pi.qtd_pedida - pi.qtd_recebida, pi.unidade_rotulo
          using errcode = '23514';
      end if;
      v_unid := pi.produto_unidade_id; v_pitem := pi.id;
      v_custo := coalesce((it ->> 'custo_unitario')::numeric, pi.custo_previsto);
      select * into e from private.embalagem(p_petshop, v_unid);
      if e.produto_id is null then
        select pi.produto_id, pi.unidade_rotulo as rotulo, pi.fator, pr.usa_como_venda, pr.nome into e
          from public.produtos pr where pr.id = pi.produto_id;
      end if;
      e.fator := pi.fator; e.rotulo := pi.unidade_rotulo;
      update public.pedido_compra_itens set qtd_recebida = qtd_recebida + v_qtd where id = pi.id;
    else
      v_unid := (it ->> 'produto_unidade_id')::uuid; v_pitem := null;
      v_custo := (it ->> 'custo_unitario')::numeric;
      select * into e from private.embalagem(p_petshop, v_unid);
      if e.produto_id is null then raise exception 'Embalagem inválida no recebimento' using errcode = '23514'; end if;
    end if;
    if v_custo is null or v_custo < 0 then raise exception 'Informe o custo de "%"', e.nome using errcode = '23514'; end if;
    if v_local.tipo = 'venda' and not e.usa_como_venda then
      raise exception '"%" não está marcado como produto de venda', e.nome using errcode = '23514';
    end if;
    v_valor := round(v_qtd * v_custo, 2);
    v_total := v_total + v_valor;
    insert into public.recebimento_itens (petshop_id, recebimento_id, pedido_item_id, produto_id, produto_unidade_id,
                                          unidade_rotulo, fator, quantidade, custo_unitario, valor_total)
    values (p_petshop, v_rec, v_pitem, e.produto_id, v_unid, e.rotulo, e.fator, v_qtd, v_custo, v_valor);
    perform private.estoque_mover(p_petshop, e.produto_id, v_local.id, v_qtd * e.fator, 'entrada_compra',
                                  v_custo / e.fator, p_recebimento => v_rec);
  end loop;

  update public.recebimentos set valor_total = v_total where id = v_rec;

  if p_pedido is not null then
    v_status := case when exists (select 1 from public.pedido_compra_itens where pedido_id = p_pedido and qtd_recebida < qtd_pedida)
                     then 'recebido_parcial' else 'recebido' end;
    update public.pedidos_compra
       set status = v_status, finalizado_em = case when v_status = 'recebido' then now() end
     where id = p_pedido;
  end if;

  -- Contas a pagar (FN-03): uma linha por parcela; a soma tem de bater com o total.
  if v_total > 0 then
    select id into v_cat from public.financeiro_categorias where petshop_id = p_petshop and codigo = 'compras';
    if p_parcelas is null or jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then
      p_parcelas := jsonb_build_array(jsonb_build_object('vencimento', (coalesce(p_recebido_em, now()) at time zone
                       (select fuso from public.petshops where id = p_petshop))::date, 'valor', v_total));
    end if;
    select sum((x ->> 'valor')::numeric), count(*) into v_soma, v_n from jsonb_array_elements(p_parcelas) x;
    if v_soma <> v_total then
      raise exception 'As parcelas somam R$ % e o recebimento soma R$ %', v_soma, v_total using errcode = '23514';
    end if;
    for pc in select * from jsonb_array_elements(p_parcelas) loop
      v_k := v_k + 1;
      if (pc ->> 'vencimento') is null or coalesce((pc ->> 'valor')::numeric, 0) <= 0 then
        raise exception 'Parcela inválida (vencimento e valor)' using errcode = '23514';
      end if;
      insert into public.contas_pagar (petshop_id, grupo_id, parcela, parcelas, descricao, categoria_id, fornecedor_id,
                                       recebimento_id, documento, vencimento, valor, criado_por)
      values (p_petshop, v_grupo, v_k, v_n,
              'Compra · recebimento ' || v_num || coalesce(' · NF ' || nullif(trim(p_nf), ''), ''),
              v_cat, v_forn, v_rec, nullif(trim(p_nf), ''), (pc ->> 'vencimento')::date, (pc ->> 'valor')::numeric, auth.uid())
      returning id into v_cid;
      v_contas := v_contas || v_cid;
    end loop;
  end if;

  return jsonb_build_object('recebimento_id', v_rec, 'numero', v_num, 'valor_total', v_total,
                            'pedido_status', v_status, 'contas_pagar', to_jsonb(v_contas));
end $$;

-- FN-03 / FN-02 · Lançamento manual (parcelas: [{vencimento, valor}])
create or replace function public.conta_lancar(
  p_petshop uuid, p_tipo text, p_descricao text, p_categoria uuid, p_parcelas jsonb,
  p_fornecedor uuid default null, p_tutor uuid default null, p_documento text default null, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid := gen_random_uuid();
  v_n int;
  v_k int := 0;
  pc jsonb;
  v_cat_tipo text;
begin
  if p_tipo not in ('pagar','receber') then raise exception 'Tipo deve ser pagar ou receber' using errcode = '22023'; end if;
  perform private.exigir_papel(p_petshop, private.papeis_financeiro());
  perform private.exigir_funcionalidade(p_petshop, case p_tipo when 'pagar' then 'administracao.contas_pagar'
                                                              else 'administracao.contas_receber' end);
  perform private.administracao_preparar(p_petshop);
  select tipo into v_cat_tipo from public.financeiro_categorias where id = p_categoria and petshop_id = p_petshop and ativo;
  if v_cat_tipo is distinct from (case p_tipo when 'pagar' then 'despesa' else 'receita' end) then
    raise exception 'Categoria inválida para conta a %', p_tipo using errcode = '23514';
  end if;
  if nullif(trim(p_descricao), '') is null then raise exception 'Informe a descrição' using errcode = '23514'; end if;
  if jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'Informe ao menos uma parcela' using errcode = '23514';
  end if;
  v_n := jsonb_array_length(p_parcelas);
  for pc in select * from jsonb_array_elements(p_parcelas) loop
    v_k := v_k + 1;
    if (pc ->> 'vencimento') is null or coalesce((pc ->> 'valor')::numeric, 0) <= 0 then
      raise exception 'Parcela inválida (vencimento e valor)' using errcode = '23514';
    end if;
    if p_tipo = 'pagar' then
      insert into public.contas_pagar (petshop_id, grupo_id, parcela, parcelas, descricao, categoria_id, fornecedor_id,
                                       documento, vencimento, valor, observacao, criado_por)
      values (p_petshop, v_grupo, v_k, v_n, trim(p_descricao), p_categoria, p_fornecedor, nullif(trim(p_documento), ''),
              (pc ->> 'vencimento')::date, (pc ->> 'valor')::numeric, nullif(trim(p_observacao), ''), auth.uid());
    else
      insert into public.contas_receber (petshop_id, grupo_id, parcela, parcelas, descricao, categoria_id, tutor_id,
                                         documento, vencimento, valor, observacao, criado_por)
      values (p_petshop, v_grupo, v_k, v_n, trim(p_descricao), p_categoria, p_tutor, nullif(trim(p_documento), ''),
              (pc ->> 'vencimento')::date, (pc ->> 'valor')::numeric, nullif(trim(p_observacao), ''), auth.uid());
    end if;
  end loop;
  return v_grupo;
end $$;

-- Editar parcela aberta. Valor de conta gerada por compra não muda (vem do recebimento).
create or replace function public.conta_editar(
  p_tipo text, p_conta uuid, p_vencimento date default null, p_valor numeric default null,
  p_descricao text default null, p_categoria uuid default null, p_observacao text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ps uuid; v_status text; v_rec uuid; v_cat_tipo text;
begin
  if p_tipo = 'pagar' then
    select petshop_id, status, recebimento_id into v_ps, v_status, v_rec from public.contas_pagar where id = p_conta for update;
  elsif p_tipo = 'receber' then
    select petshop_id, status into v_ps, v_status from public.contas_receber where id = p_conta for update;
  else raise exception 'Tipo deve ser pagar ou receber' using errcode = '22023'; end if;
  if v_ps is null then raise exception 'Conta não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(v_ps, private.papeis_financeiro());
  if v_status <> 'aberta' then raise exception 'Só conta aberta pode ser editada' using errcode = '23514'; end if;
  if p_valor is not null and (p_valor <= 0 or v_rec is not null) then
    raise exception 'Valor inválido (conta de compra tem o valor do recebimento)' using errcode = '23514';
  end if;
  if p_categoria is not null then
    select tipo into v_cat_tipo from public.financeiro_categorias where id = p_categoria and petshop_id = v_ps and ativo;
    if v_cat_tipo is distinct from (case p_tipo when 'pagar' then 'despesa' else 'receita' end) then
      raise exception 'Categoria inválida' using errcode = '23514';
    end if;
  end if;
  if p_tipo = 'pagar' then
    update public.contas_pagar set vencimento = coalesce(p_vencimento, vencimento), valor = coalesce(p_valor, valor),
           descricao = coalesce(nullif(trim(p_descricao), ''), descricao), categoria_id = coalesce(p_categoria, categoria_id),
           observacao = coalesce(p_observacao, observacao)
     where id = p_conta;
  else
    update public.contas_receber set vencimento = coalesce(p_vencimento, vencimento), valor = coalesce(p_valor, valor),
           descricao = coalesce(nullif(trim(p_descricao), ''), descricao), categoria_id = coalesce(p_categoria, categoria_id),
           observacao = coalesce(p_observacao, observacao)
     where id = p_conta;
  end if;
end $$;

-- Baixa (paga / recebida), cancelamento e reabertura.
create or replace function public.conta_baixar(
  p_tipo text, p_conta uuid, p_forma text, p_data date default null, p_valor numeric default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_ps uuid; v_status text; v_valor numeric;
begin
  if p_tipo = 'pagar' then
    select petshop_id, status, valor into v_ps, v_status, v_valor from public.contas_pagar where id = p_conta for update;
  elsif p_tipo = 'receber' then
    select petshop_id, status, valor into v_ps, v_status, v_valor from public.contas_receber where id = p_conta for update;
  else raise exception 'Tipo deve ser pagar ou receber' using errcode = '22023'; end if;
  if v_ps is null then raise exception 'Conta não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(v_ps, private.papeis_financeiro());
  if v_status <> 'aberta' then raise exception 'Só conta aberta recebe baixa' using errcode = '23514'; end if;
  if coalesce(p_valor, v_valor) < 0 then raise exception 'Valor inválido' using errcode = '23514'; end if;
  if p_tipo = 'pagar' then
    update public.contas_pagar set status = 'paga', pago_em = coalesce(p_data, current_date),
           valor_pago = coalesce(p_valor, valor), forma_pagamento = p_forma, baixado_por = auth.uid()
     where id = p_conta;
  else
    update public.contas_receber set status = 'recebida', recebido_em = coalesce(p_data, current_date),
           valor_recebido = coalesce(p_valor, valor), forma_pagamento = p_forma, baixado_por = auth.uid()
     where id = p_conta;
  end if;
end $$;

create or replace function public.conta_cancelar(p_tipo text, p_conta uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_ps uuid; v_status text;
begin
  if p_tipo = 'pagar' then
    select petshop_id, status into v_ps, v_status from public.contas_pagar where id = p_conta for update;
  elsif p_tipo = 'receber' then
    select petshop_id, status into v_ps, v_status from public.contas_receber where id = p_conta for update;
  else raise exception 'Tipo deve ser pagar ou receber' using errcode = '22023'; end if;
  if v_ps is null then raise exception 'Conta não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(v_ps, private.papeis_financeiro());
  if v_status <> 'aberta' then raise exception 'Só conta aberta pode ser cancelada' using errcode = '23514'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo' using errcode = '23514'; end if;
  if p_tipo = 'pagar' then
    update public.contas_pagar set status = 'cancelada', motivo = trim(p_motivo), baixado_por = auth.uid() where id = p_conta;
  else
    update public.contas_receber set status = 'cancelada', motivo = trim(p_motivo), baixado_por = auth.uid() where id = p_conta;
  end if;
end $$;

create or replace function public.conta_reabrir(p_tipo text, p_conta uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_ps uuid; v_status text;
begin
  if p_tipo = 'pagar' then
    select petshop_id, status into v_ps, v_status from public.contas_pagar where id = p_conta for update;
  elsif p_tipo = 'receber' then
    select petshop_id, status into v_ps, v_status from public.contas_receber where id = p_conta for update;
  else raise exception 'Tipo deve ser pagar ou receber' using errcode = '22023'; end if;
  if v_ps is null then raise exception 'Conta não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(v_ps, private.papeis_financeiro());
  if v_status = 'aberta' then raise exception 'A conta já está aberta' using errcode = '23514'; end if;
  if p_tipo = 'pagar' then
    update public.contas_pagar set status = 'aberta', pago_em = null, valor_pago = null, forma_pagamento = null,
           motivo = null, baixado_por = null where id = p_conta;
  else
    update public.contas_receber set status = 'aberta', recebido_em = null, valor_recebido = null, forma_pagamento = null,
           motivo = null, baixado_por = null where id = p_conta;
  end if;
end $$;

-- FN-02 · Contas a receber em aberto: fiados do check-out (calculados) + lançamentos manuais.
create or replace function public.contas_receber_abertas(p_petshop uuid)
returns table (origem text, id uuid, descricao text, tutor_id uuid, tutor text, vencimento date,
               valor numeric, recebido numeric, saldo numeric, dias_atraso int, situacao text)
language plpgsql stable security definer set search_path = '' as $$
declare v_fuso text;
begin
  perform private.exigir_papel(p_petshop, private.papeis_financeiro());
  perform private.exigir_funcionalidade(p_petshop, 'administracao.contas_receber');
  select fuso into v_fuso from public.petshops where petshops.id = p_petshop;
  return query
    select 'agendamento'::text, a.id,
           coalesce(pt.nome, 'Pet') || ' · atendimento de ' || to_char(a.inicio at time zone v_fuso, 'DD/MM/YYYY'),
           a.tutor_id, tp.nome, (coalesce(a.checkout_em, a.inicio) at time zone v_fuso)::date,
           a.valor_total, coalesce(pg.pago, 0), a.valor_total - coalesce(pg.pago, 0),
           greatest(((now() at time zone v_fuso)::date - (coalesce(a.checkout_em, a.inicio) at time zone v_fuso)::date), 0),
           a.pagamento_status
      from public.agendamentos a
      join public.tutor_petshop tp on tp.tutor_id = a.tutor_id and tp.petshop_id = a.petshop_id
      left join public.pets pt on pt.id = a.pet_id
      left join lateral (select sum(p.valor) as pago from public.pagamentos p where p.agendamento_id = a.id) pg on true
     where a.petshop_id = p_petshop and a.status = 'entregue'
       and a.pagamento_status in ('fiado','parcial','pendente')
       and a.valor_total - coalesce(pg.pago, 0) > 0
    union all
    select 'manual'::text, c.id,
           c.descricao || case when c.parcelas > 1 then ' (' || c.parcela || '/' || c.parcelas || ')' else '' end,
           c.tutor_id, tp.nome, c.vencimento, c.valor, 0::numeric, c.valor,
           greatest((now() at time zone v_fuso)::date - c.vencimento, 0), 'aberta'::text
      from public.contas_receber c
      left join public.tutor_petshop tp on tp.tutor_id = c.tutor_id and tp.petshop_id = c.petshop_id
     where c.petshop_id = p_petshop and c.status = 'aberta';
end $$;

-- FN-02 · Recebimento posterior de um atendimento (fiado, parcial ou pendente).
-- Mesma regra de situação do fazer_checkout; não mexe no check-out.
create or replace function public.receber_agendamento(p_agendamento uuid, p_forma text, p_valor numeric)
returns public.agendamentos
language plpgsql security definer set search_path = '' as $$
declare
  a public.agendamentos;
  v_pago numeric;
begin
  select * into a from public.agendamentos where id = p_agendamento for update;
  if a.id is null then raise exception 'Agendamento não encontrado' using errcode = 'P0002'; end if;
  perform private.exigir_papel(a.petshop_id, private.papeis_financeiro());
  perform private.exigir_funcionalidade(a.petshop_id, 'administracao.contas_receber');
  if a.status <> 'entregue' then raise exception 'Só atendimento entregue tem conta a receber' using errcode = '23514'; end if;
  select coalesce(sum(valor), 0) into v_pago from public.pagamentos where agendamento_id = a.id;
  if p_valor is null or p_valor <= 0 or p_valor > a.valor_total - v_pago then
    raise exception 'Valor inválido: saldo a receber é R$ %', a.valor_total - v_pago using errcode = '23514';
  end if;
  insert into public.pagamentos (petshop_id, agendamento_id, forma, valor, registrado_por)
  values (a.petshop_id, a.id, p_forma, p_valor, auth.uid());
  v_pago := v_pago + p_valor;
  update public.agendamentos
     set pagamento_status = case when v_pago >= valor_total and valor_total > 0 then 'pago'
                                 when v_pago > 0 then 'parcial' else pagamento_status end
   where id = a.id returning * into a;
  return a;
end $$;

-- ---------------------------------------------------------------------
-- 8. RLS e permissões
-- ---------------------------------------------------------------------
-- Nível novo "estoque" (dono, gerente, estoquista) no gerador do arquivo 07.
create or replace function private.expr_acesso(p_nivel text) returns text
language sql immutable set search_path = '' as $$
  select case p_nivel
    when 'membro'     then '(select private.eh_super_admin()) or petshop_id in (select private.meus_petshops())'
    when 'operacao'   then '(select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao()))'
    when 'config'     then '(select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_config()))'
    when 'financeiro' then '(select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_financeiro()))'
    when 'estoque'    then '(select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_estoque()))'
    when 'super'      then '(select private.eh_super_admin())'
    else null end;
$$;

do $$
declare
  r record;
  e_ler text; e_esc text; e_del text;
  pol text;
begin
  for r in select * from (values
      -- tabela                   ler           escrever      apagar      escrita direta pelo painel?
      ('documento_sequencias',    'nenhum',     'nenhum',     'nenhum',   false),
      ('financeiro_categorias',   'financeiro', 'financeiro', 'financeiro', true),
      ('fornecedores',            'estoque',    'estoque',    'estoque',  true),
      ('produtos',                'membro',     'estoque',    'estoque',  true),
      ('produto_unidades',        'membro',     'estoque',    'estoque',  true),
      ('produto_custos',          'estoque',    'nenhum',     'nenhum',   false),
      ('estoque_locais',          'membro',     'config',     'config',   true),
      ('estoque_saldos',          'membro',     'nenhum',     'nenhum',   false),
      ('estoque_movimentos',      'estoque',    'nenhum',     'nenhum',   false),
      ('requisicoes',             'membro',     'nenhum',     'nenhum',   false),
      ('requisicao_itens',        'membro',     'nenhum',     'nenhum',   false),
      ('transferencias',          'membro',     'nenhum',     'nenhum',   false),
      ('transferencia_itens',     'membro',     'nenhum',     'nenhum',   false),
      ('inventarios',             'estoque',    'nenhum',     'nenhum',   false),
      ('inventario_itens',        'estoque',    'nenhum',     'nenhum',   false),
      ('pedidos_compra',          'estoque',    'estoque',    'estoque',  true),
      ('pedido_compra_itens',     'estoque',    'estoque',    'estoque',  true),
      ('recebimentos',            'estoque',    'nenhum',     'nenhum',   false),
      ('recebimento_itens',       'estoque',    'nenhum',     'nenhum',   false),
      ('contas_pagar',            'financeiro', 'nenhum',     'nenhum',   false),
      ('contas_receber',          'financeiro', 'nenhum',     'nenhum',   false)
    ) v(tabela, ler, escrever, apagar, direta)
  loop
    execute format('alter table public.%I enable row level security', r.tabela);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = r.tabela loop
      execute format('drop policy %I on public.%I', pol, r.tabela);
    end loop;
    e_ler := private.expr_acesso(r.ler);
    e_esc := private.expr_acesso(r.escrever);
    e_del := private.expr_acesso(r.apagar);
    if e_ler is not null then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', r.tabela || '_ler', r.tabela, e_ler);
    end if;
    if e_esc is not null then
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)', r.tabela || '_inserir', r.tabela, e_esc);
      execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                     r.tabela || '_alterar', r.tabela, e_esc, e_esc);
    end if;
    if e_del is not null then
      execute format('create policy %I on public.%I for delete to authenticated using (%s)', r.tabela || '_apagar', r.tabela, e_del);
    end if;
    -- GRANTs: leitura para todos (a RLS filtra); escrita só nas tabelas editáveis pelo painel.
    execute format('revoke all on public.%I from anon, authenticated', r.tabela);
    execute format('grant all on public.%I to service_role', r.tabela);
    if r.ler <> 'nenhum' then execute format('grant select on public.%I to authenticated', r.tabela); end if;
    if r.direta then execute format('grant insert, update, delete on public.%I to authenticated', r.tabela); end if;
  end loop;
end $$;

-- Funções: as RPCs para o painel; as internas fora da API.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura, n.nspname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'public' and p.proname in (
              'meus_papeis','definir_papeis_adicionais','administracao_preparar','estoque_definir_minimo','estoque_avisos',
              'requisicao_criar','requisicao_atender','requisicao_recusar','requisicao_cancelar',
              'devolucao_criar','devolucao_aprovar','devolucao_receber',
              'transferencia_criar','transferencia_decidir','transferencia_cancelar','transferencia_confirmar',
              'inventario_abrir','inventario_contar','inventario_fechar','inventario_cancelar',
              'pedido_compra_enviar','pedido_compra_cancelar','pedido_compra_encerrar','compra_receber',
              'conta_lancar','conta_editar','conta_baixar','conta_cancelar','conta_reabrir',
              'contas_receber_abertas','receber_agendamento'))
        or (n.nspname = 'private' and p.proname in (
              'pode','papeis_estoque','papeis_requisicao','exigir_funcionalidade','proximo_numero','via_painel',
              'administracao_preparar','estoque_mover','saldo','embalagem','local_ativo',
              'produtos_antes','produtos_depois','produto_unidades_proteger','estoque_locais_antes',
              'pedidos_compra_proteger','pedido_compra_itens_proteger','financeiro_categorias_proteger'))
  loop
    execute format('revoke all on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $$;
-- Internas que movem estoque ou numeram documentos: nunca chamadas direto pelo painel.
revoke execute on function private.estoque_mover(uuid, uuid, uuid, numeric, text, numeric, uuid, uuid, uuid, uuid) from authenticated;
revoke execute on function private.administracao_preparar(uuid) from authenticated;

-- ---------------------------------------------------------------------
-- 9. Pet shops existentes: almoxarifado e categorias
-- ---------------------------------------------------------------------
select private.administracao_preparar(id) from public.petshops;

-- ---------------------------------------------------------------------
-- 10. T12 de private.rodar_testes_petcare() (arquivo 10) no modelo novo
--     Troca só o bloco do T12 e a variável do tipo insumos. Na 2ª aplicação,
--     o marcador "T12 ESTOQUE (22)" faz pular.
-- ---------------------------------------------------------------------
do $do$
declare
  v_def text;
  v_novo text;
  v_t12 text := $t12$-- ------------------------------------------------------------ T12 ESTOQUE (22)
    perform private.administracao_preparar(pf);
    insert into public.produtos (petshop_id, nome, unidade_base) values (pf, 'Shampoo neutro (teste T12)', 'ml') returning id into v_ins;
    insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator) values (pf, v_ins, 'Galão 5 L (T12)', 5000);
    perform public.compra_receber(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id',
              (select id from public.produto_unidades where produto_id = v_ins and not eh_base), 'quantidade', 4, 'custo_unitario', 80)));
    perform public.compra_receber(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id',
              (select id from public.produto_unidades where produto_id = v_ins and not eh_base), 'quantidade', 4, 'custo_unitario', 100)));
    v_req := public.requisicao_criar(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id',
              (select id from public.produto_unidades where produto_id = v_ins and not eh_base), 'quantidade', 1)), null, ana);
    perform public.requisicao_atender(v_req);
    assert (select sum(quantidade) from public.estoque_saldos where produto_id = v_ins) = 35000
       and (select custo_medio from public.produto_custos where produto_id = v_ins) = 0.018,
           'FALHOU T12: saldo ' || (select sum(quantidade) from public.estoque_saldos where produto_id = v_ins)
           || ' custo ' || (select custo_medio from public.produto_custos where produto_id = v_ins);
    saida := saida || 'OK T12 estoque: compra com embalagem, requisição baixa no envio, custo médio ponderado'::text;
$t12$;
begin
  if to_regprocedure('private.rodar_testes_petcare()') is null then
    raise notice 'Arquivo 22: private.rodar_testes_petcare() não existe; T12 não atualizado.';
    return;
  end if;
  v_def := pg_get_functiondef('private.rodar_testes_petcare()'::regprocedure);
  if position('T12 ESTOQUE (22)' in v_def) > 0 then return; end if;
  v_novo := regexp_replace(v_def,
              '-- -+ T12 ALMOXARIFADO.*?saida := saida \|\| ''OK T12 [^\n]*\n', v_t12, 's');
  v_novo := replace(v_novo, ' v public.insumos;', ' v record;');
  if v_novo = v_def or position('public.insumos' in v_novo) > 0 then
    raise exception 'Arquivo 22: não achei o bloco T12 do arquivo 10 para atualizar';
  end if;
  execute v_novo;
end $do$;

select 'Arquivo 22 aplicado: produtos, estoque por local, requisição, transferência, inventário, compras, contas a pagar e a receber.' as resultado;

commit;
