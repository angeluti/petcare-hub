-- =====================================================================
-- PetCare Hub · 02 · Identidade global de tutor e pet
-- Escolhas da seção 8:
--   (4) histórico do pet como linha do tempo com nível de visibilidade
--   (8) tutor e pet globais + vínculo por pet shop
-- Regra de privacidade embutida no banco:
--   • tutor global = só o telefone. Nome, endereço e observações ficam no
--     vínculo, então um pet shop nunca vê dado digitado por outro.
--   • estética (banho e tosa) NUNCA é compartilhável: CHECK no banco.
--   • dado clínico só aparece para outro estabelecimento com consentimento
--     ativo do tutor; revogou, sumiu na hora (a política lê o consentimento).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Tutor global: a identidade é o telefone.
-- ---------------------------------------------------------------------
create table public.tutores (
  id         uuid primary key default gen_random_uuid(),
  telefone   text not null unique check (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  criado_em  timestamptz not null default now()
);

-- Vínculo tutor ↔ pet shop: tudo que é do relacionamento comercial.
create table public.tutor_petshop (
  id             uuid primary key default gen_random_uuid(),
  tutor_id       uuid not null references public.tutores(id) on delete cascade,
  petshop_id     uuid not null references public.petshops(id) on delete cascade,
  nome           text not null,
  email          text,
  endereco       text,
  observacoes    text,                         -- comerciais; nunca compartilhadas
  origem         text not null default 'manual' check (origem in ('bot','manual','importacao','site','compartilhado')),
  aceita_mensagens boolean not null default true,   -- opt-out de mensagens automáticas (TP-12)
  opt_out_em     timestamptz,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (tutor_id, petshop_id)
);
create index tutor_petshop_petshop_idx on public.tutor_petshop (petshop_id);
create trigger tutor_petshop_atualizado before update on public.tutor_petshop
  for each row execute function private.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Pet global: dados básicos e de saúde (compartilháveis com consentimento).
-- ---------------------------------------------------------------------
create table public.pets (
  id                     uuid primary key default gen_random_uuid(),
  tutor_id               uuid not null references public.tutores(id),   -- responsável principal
  nome                   text not null,
  especie                text not null default 'cao' check (especie in ('cao','gato','outro')),
  raca                   text,
  nascimento             date,
  porte                  text check (porte in ('P','M','G','GG')),
  sexo                   text check (sexo in ('M','F')),
  pelagem                text check (pelagem in ('curta','media','longa','dupla','encaracolada','sem_pelo')),
  peso_kg                numeric(5,2) check (peso_kg > 0),
  foto_url               text,
  alergias               text,
  condicoes              text,
  -- Ficha pública do QR: desligada por padrão; o tutor escolhe os campos.
  ficha_publica          jsonb not null default '{"ativa": false, "campos": ["nome","especie","raca"]}',
  criado_por_petshop_id  uuid references public.petshops(id) on delete set null,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index pets_tutor_idx on public.pets (tutor_id);
create trigger pets_atualizado before update on public.pets
  for each row execute function private.tocar_atualizado_em();

-- Vínculo pet ↔ pet shop: o que é operacional e privado do estabelecimento.
create table public.pet_petshop (
  id            uuid primary key default gen_random_uuid(),
  pet_id        uuid not null references public.pets(id) on delete cascade,
  petshop_id    uuid not null references public.petshops(id) on delete cascade,
  temperamento  text,      -- "morde na tosa", "usa focinheira" (TP-04)
  preferencias  text,      -- tipo de tosa, perfume, sem laço (TP-07)
  observacoes   text,
  origem        text not null default 'cadastro' check (origem in ('cadastro','compartilhado','importacao')),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (pet_id, petshop_id)
);
create index pet_petshop_petshop_idx on public.pet_petshop (petshop_id);

-- ---------------------------------------------------------------------
-- Consentimento do tutor (LGPD): data, escopo, revogação, versão do termo.
-- ⚠️ Validar o texto e o fluxo com advogado antes de ativar o compartilhamento.
-- ---------------------------------------------------------------------
create table public.consentimentos (
  id                  uuid primary key default gen_random_uuid(),
  tutor_id            uuid not null references public.tutores(id) on delete cascade,
  escopo              text not null check (escopo in ('compartilhar_dados_pet','compartilhar_saude')),
  versao_termo        text not null,
  canal               text not null check (canal in ('bot','painel','presencial','app')),
  petshop_origem_id   uuid references public.petshops(id) on delete set null,
  evidencia           jsonb not null default '{}',     -- ex.: id da mensagem do WhatsApp
  concedido_em        timestamptz not null default now(),
  revogado_em         timestamptz,
  check (revogado_em is null or revogado_em >= concedido_em)
);
create unique index consentimentos_ativo_uidx on public.consentimentos (tutor_id, escopo) where revogado_em is null;

create or replace function private.tutor_consente(p_tutor uuid, p_escopo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consentimentos
                 where tutor_id = p_tutor and escopo = p_escopo and revogado_em is null);
$$;

-- ---------------------------------------------------------------------
-- Linha do tempo do pet (escolha 4). O prontuário do Vet é uma visão disto.
-- ---------------------------------------------------------------------
create table public.pet_eventos (
  id              uuid primary key default gen_random_uuid(),
  pet_id          uuid not null,
  petshop_id      uuid not null,           -- estabelecimento que registrou
  tipo            text not null check (tipo in ('estetica','consulta','vacina','exame','procedimento','receita',
                                                'hospedagem','creche','observacao')),
  categoria       text generated always as (
                    case
                      when tipo = 'estetica' then 'estetica'
                      when tipo in ('consulta','vacina','exame','procedimento','receita') then 'clinico'
                      when tipo in ('hospedagem','creche') then 'hospedagem'
                      else 'geral'
                    end) stored,
  visibilidade    text not null default 'privado' check (visibilidade in ('privado','compartilhavel')),
  ocorrido_em     timestamptz not null default now(),
  agendamento_id  uuid,                    -- FK criada no 03 (agendamentos ainda não existe)
  titulo          text not null,
  dados           jsonb not null default '{}',   -- vacina: {"vacina":"V10","lote":"…","validade":"2027-11-01"}
  criado_por      uuid references auth.users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  -- Só evento clínico pode ser compartilhado. Banho e tosa nunca.
  constraint pet_eventos_so_clinico_compartilha check (visibilidade = 'privado' or categoria = 'clinico'),
  -- Quem registra precisa ter o pet vinculado.
  foreign key (pet_id, petshop_id) references public.pet_petshop (pet_id, petshop_id) on delete cascade
);
create index pet_eventos_pet_idx on public.pet_eventos (pet_id, ocorrido_em desc);
create index pet_eventos_petshop_idx on public.pet_eventos (petshop_id, ocorrido_em desc);

-- ---------------------------------------------------------------------
-- Plaquinhas do Craft Studio
-- ---------------------------------------------------------------------
create table public.plaquinhas (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid references public.pets(id) on delete set null,
  petshop_id   uuid references public.petshops(id) on delete set null,   -- quem vendeu/entregou
  kit          text not null check (kit in ('essencial','metal','couro','familia','b2b','decoracao')),
  material     text,
  -- Código curto no QR: URL menor = QR menos denso, lê melhor em 2 cm, e dá
  -- para desativar uma plaquinha perdida sem mexer no pet.
  codigo       text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  qr_ativo     boolean not null default true,
  valor        numeric(10,2),
  entregue_em  date,
  criado_em    timestamptz not null default now()
);
create index plaquinhas_pet_idx on public.plaquinhas (pet_id);

-- Ficha pública (pet.petcarehub.com.br/{codigo} ou /{pet_id}). Única porta do anon.
create or replace function public.ficha_publica(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pet    public.pets;
  v_campos jsonb;
  v_out    jsonb := '{}';
begin
  select p.* into v_pet
    from public.plaquinhas q join public.pets p on p.id = q.pet_id
   where q.codigo = upper(p_ref) and q.qr_ativo;
  if v_pet.id is null and p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.* into v_pet from public.pets p where p.id = p_ref::uuid;
  end if;
  if v_pet.id is null or not coalesce((v_pet.ficha_publica ->> 'ativa')::boolean, false) then
    return null;
  end if;
  v_campos := coalesce(v_pet.ficha_publica -> 'campos', '[]'::jsonb);
  if v_campos ? 'nome'      then v_out := v_out || jsonb_build_object('nome', v_pet.nome); end if;
  if v_campos ? 'especie'   then v_out := v_out || jsonb_build_object('especie', v_pet.especie); end if;
  if v_campos ? 'raca'      then v_out := v_out || jsonb_build_object('raca', v_pet.raca); end if;
  if v_campos ? 'porte'     then v_out := v_out || jsonb_build_object('porte', v_pet.porte); end if;
  if v_campos ? 'foto'      then v_out := v_out || jsonb_build_object('foto_url', v_pet.foto_url); end if;
  if v_campos ? 'alergias'  then v_out := v_out || jsonb_build_object('alergias', v_pet.alergias); end if;
  if v_campos ? 'condicoes' then v_out := v_out || jsonb_build_object('condicoes', v_pet.condicoes); end if;
  if v_campos ? 'contato'   then
    v_out := v_out || jsonb_build_object('contato_whatsapp',
               (select t.telefone from public.tutores t where t.id = v_pet.tutor_id));
  end if;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- RPCs de cadastro. Por que RPC e não INSERT direto:
-- telefone é único global; um INSERT que falha com "já existe" contaria
-- ao pet shop B que o tutor está em outro estabelecimento. A RPC sempre
-- responde igual, exista ou não.
-- ---------------------------------------------------------------------
create or replace function public.cadastrar_tutor(
  p_petshop uuid, p_telefone text, p_nome text, p_origem text default 'manual')
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tel   text := private.normalizar_telefone(p_telefone);
  v_tutor uuid;
begin
  perform private.exigir_papel(p_petshop, private.papeis_operacao());
  if v_tel is null then raise exception 'Telefone obrigatório'; end if;
  insert into public.tutores (telefone) values (v_tel)
    on conflict (telefone) do update set telefone = excluded.telefone
    returning id into v_tutor;
  insert into public.tutor_petshop (tutor_id, petshop_id, nome, origem)
    values (v_tutor, p_petshop, coalesce(nullif(trim(p_nome), ''), 'Sem nome'), p_origem)
    on conflict (tutor_id, petshop_id) do nothing;
  return v_tutor;
end $$;

create or replace function public.cadastrar_pet(
  p_petshop uuid, p_tutor uuid, p_nome text, p_porte text,
  p_especie text default 'cao', p_raca text default null, p_nascimento date default null)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_pet uuid;
begin
  perform private.exigir_papel(p_petshop, private.papeis_operacao());
  if not exists (select 1 from public.tutor_petshop where tutor_id = p_tutor and petshop_id = p_petshop) then
    raise exception 'Tutor não vinculado a este pet shop';
  end if;
  insert into public.pets (tutor_id, nome, porte, especie, raca, nascimento, criado_por_petshop_id)
    values (p_tutor, p_nome, p_porte, p_especie, p_raca, p_nascimento, p_petshop)
    returning id into v_pet;
  insert into public.pet_petshop (pet_id, petshop_id, origem) values (v_pet, p_petshop, 'cadastro');
  return v_pet;
end $$;

commit;
