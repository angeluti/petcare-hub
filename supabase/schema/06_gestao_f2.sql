-- =====================================================================
-- PetCare Hub · 06 · Estruturas do F2 (Administração e comercial Harpia)
-- Por que criar já: os dados novos da rev. 3 ficam com forma definida e a
-- RLS é escrita uma vez só. As telas vêm no F2; as tabelas ficam vazias.
-- Escolha 9: estoque movimentado por REQUISIÇÃO, nunca pelo atendimento.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Custos do pet shop (CF-15) → custo do serviço e margem real
-- ---------------------------------------------------------------------
create table public.petshop_custos_config (
  petshop_id         uuid primary key references public.petshops(id) on delete cascade,
  peso_p             numeric(4,2) not null default 1,
  peso_m             numeric(4,2) not null default 1.5,
  peso_g             numeric(4,2) not null default 2,
  peso_gg            numeric(4,2) not null default 3,
  aliquota_imposto   numeric(5,2) not null default 6.00,   -- % sobre a receita; confirmar com o contador do pet shop
  rateio_utilidades  text not null default 'tempo' check (rateio_utilidades in ('tempo','porte')),
  atualizado_em      timestamptz not null default now()
);

create table public.taxas_pagamento (
  petshop_id   uuid not null references public.petshops(id) on delete cascade,
  forma        text not null check (forma in ('pix','dinheiro','debito','credito','outro')),
  percentual   numeric(5,2) not null default 0,
  valor_fixo   numeric(10,2) not null default 0,
  primary key (petshop_id, forma)
);

create table public.custos_mensais (
  id           uuid primary key default gen_random_uuid(),
  petshop_id   uuid not null references public.petshops(id) on delete cascade,
  competencia  date not null check (extract(day from competencia) = 1),
  categoria    text not null check (categoria in ('agua','energia','aluguel','sistema','contador','depreciacao',
                                                  'manutencao','lavanderia','descartaveis','taxi_dog','outro')),
  descricao    text not null default '',
  valor        numeric(10,2) not null check (valor >= 0),
  unique (petshop_id, competencia, categoria, descricao)
);

-- Custo da mão de obra por recurso. "executado_pelo_dono" zera salário/comissão,
-- mas pro_labore_hora deixa o dono enxergar o custo do próprio tempo.
create table public.recurso_custos (
  recurso_id           uuid primary key,
  petshop_id           uuid not null,
  executado_pelo_dono  boolean not null default false,
  salario_mensal       numeric(10,2) not null default 0,
  encargos_percentual  numeric(5,2) not null default 0,
  horas_mes            numeric(6,1) not null default 176,
  pro_labore_hora      numeric(10,2),
  comissao_tipo        text not null default 'nenhuma' check (comissao_tipo in ('nenhuma','percentual','fixo')),
  comissao_valor       numeric(10,2) not null default 0,
  foreign key (recurso_id, petshop_id) references public.recursos (id, petshop_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Almoxarifado: requisição de insumos (modelo PCP simplificado)
-- ---------------------------------------------------------------------
create table public.fornecedores (
  id                  uuid primary key default gen_random_uuid(),
  petshop_id          uuid not null references public.petshops(id) on delete cascade,
  nome                text not null,
  contato             text,
  prazo_entrega_dias  int check (prazo_entrega_dias >= 0),
  ativo               boolean not null default true,
  unique (id, petshop_id)
);

create table public.insumos (
  id                    uuid primary key default gen_random_uuid(),
  petshop_id            uuid not null references public.petshops(id) on delete cascade,
  nome                  text not null,
  unidade               text not null check (unidade in ('un','ml','l','g','kg','pct','frasco','rolo')),
  estoque_atual         numeric(12,3) not null default 0,
  estoque_minimo        numeric(12,3) not null default 0,
  custo_medio           numeric(12,4) not null default 0,
  fornecedor_padrao_id  uuid,
  ativo                 boolean not null default true,
  unique (petshop_id, nome),
  unique (id, petshop_id),
  foreign key (fornecedor_padrao_id, petshop_id) references public.fornecedores (id, petshop_id)
);

create table public.requisicoes (
  id              uuid primary key default gen_random_uuid(),
  petshop_id      uuid not null references public.petshops(id) on delete cascade,
  solicitado_por  uuid references auth.users(id) on delete set null,
  recurso_id      uuid,
  solicitada_em   timestamptz not null default now(),
  observacao      text,
  unique (id, petshop_id),
  foreign key (recurso_id, petshop_id) references public.recursos (id, petshop_id)
);

create table public.requisicao_itens (
  id             uuid primary key default gen_random_uuid(),
  requisicao_id  uuid not null,
  petshop_id     uuid not null,
  insumo_id      uuid not null,
  quantidade     numeric(12,3) not null check (quantidade > 0),
  foreign key (requisicao_id, petshop_id) references public.requisicoes (id, petshop_id) on delete cascade,
  foreign key (insumo_id, petshop_id)     references public.insumos (id, petshop_id)
);

create table public.compras (
  id              uuid primary key default gen_random_uuid(),
  petshop_id      uuid not null references public.petshops(id) on delete cascade,
  fornecedor_id   uuid,
  status          text not null default 'rascunho' check (status in ('rascunho','pedida','recebida','cancelada')),
  data_pedido     date,
  data_prevista   date,
  data_recebida   date,
  total           numeric(12,2) not null default 0,
  unique (id, petshop_id),
  foreign key (fornecedor_id, petshop_id) references public.fornecedores (id, petshop_id)
);

create table public.compra_itens (
  id              uuid primary key default gen_random_uuid(),
  compra_id       uuid not null,
  petshop_id      uuid not null,
  insumo_id       uuid not null,
  quantidade      numeric(12,3) not null check (quantidade > 0),
  custo_unitario  numeric(12,4) not null check (custo_unitario >= 0),
  foreign key (compra_id, petshop_id) references public.compras (id, petshop_id) on delete cascade,
  foreign key (insumo_id, petshop_id) references public.insumos (id, petshop_id)
);

-- Livro-razão do estoque. quantidade com sinal: + entrada, − saída.
create table public.estoque_movimentos (
  id              uuid primary key default gen_random_uuid(),
  petshop_id      uuid not null,
  insumo_id       uuid not null,
  tipo            text not null check (tipo in ('entrada_compra','saida_requisicao','ajuste')),
  quantidade      numeric(12,3) not null check (quantidade <> 0),
  custo_unitario  numeric(12,4),
  requisicao_id   uuid references public.requisicoes(id) on delete set null,
  compra_id       uuid references public.compras(id) on delete set null,
  ocorrido_em     timestamptz not null default now(),
  criado_por      uuid references auth.users(id) on delete set null,
  check ((tipo = 'entrada_compra' and quantidade > 0) or (tipo = 'saida_requisicao' and quantidade < 0) or tipo = 'ajuste'),
  foreign key (insumo_id, petshop_id) references public.insumos (id, petshop_id)
);
create index estoque_movimentos_idx on public.estoque_movimentos (petshop_id, insumo_id, ocorrido_em);

-- Saldo e custo médio ponderado (entradas recalculam o custo; saídas não).
create or replace function private.estoque_aplicar_movimento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.insumos i
     set custo_medio = case
           when new.tipo = 'entrada_compra' and new.custo_unitario is not null and i.estoque_atual + new.quantidade > 0
             then round(((greatest(i.estoque_atual, 0) * i.custo_medio) + (new.quantidade * new.custo_unitario))
                        / (greatest(i.estoque_atual, 0) + new.quantidade), 4)
           else i.custo_medio end,
         estoque_atual = i.estoque_atual + new.quantidade
   where i.id = new.insumo_id;
  return null;
end $$;
create trigger estoque_movimentos_aplicar after insert on public.estoque_movimentos
  for each row execute function private.estoque_aplicar_movimento();

-- Item de requisição gera a saída do estoque ao custo médio do momento.
create or replace function private.requisicao_baixar_estoque() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.estoque_movimentos (petshop_id, insumo_id, tipo, quantidade, custo_unitario, requisicao_id, criado_por)
  select new.petshop_id, new.insumo_id, 'saida_requisicao', -new.quantidade, i.custo_medio, new.requisicao_id, auth.uid()
    from public.insumos i where i.id = new.insumo_id;
  return null;
end $$;
create trigger requisicao_itens_baixar after insert on public.requisicao_itens
  for each row execute function private.requisicao_baixar_estoque();
-- F2: compra recebida → movimentos de entrada + conta a pagar (financeiro).

-- ---------------------------------------------------------------------
-- Comercial Harpia (só super admin vê)
-- ---------------------------------------------------------------------
create table public.harpia_contratos (
  petshop_id           uuid primary key references public.petshops(id) on delete cascade,
  setup_tipo           text not null default 'padrao' check (setup_tipo in ('padrao','personalizado')),
  setup_valor          numeric(10,2) not null default 0,
  setup_pago_em        date,
  desconto_percentual  numeric(5,2) not null default 0 check (desconto_percentual between 0 and 100),
  desconto_motivo      text,
  inicio_cobranca      date,
  observacoes          text,
  atualizado_em        timestamptz not null default now()
);

create table public.harpia_servicos_avulsos (
  id             uuid primary key default gen_random_uuid(),
  petshop_id     uuid not null references public.petshops(id) on delete cascade,
  servico        text not null check (servico in ('personalizacao_mensagens','migracao_agenda','cadastro_clientes',
                                                  'treinamento_hora','urgencia','plaquinhas','outro')),
  quantidade     numeric(10,2) not null default 1,
  valor_total    numeric(10,2) not null,
  contratado_em  date not null default current_date,
  observacoes    text
);

commit;
