-- =====================================================================
-- PetCare Hub · 21 · Ficha pública, plaquinhas e número central de achados
-- Decisões de 11/11/2026 (chat "Ficha pública, Meu Pet e plaquinhas"):
--   • QR leva um CÓDIGO CURTO: pet.petcarehub.com.br/{codigo}, 6 caracteres
--     em base32 Crockford (sem I, L, O, U), nunca reutilizado. O id do pet
--     não sai mais do banco (a busca por UUID do arquivo 02 foi removida).
--   • A plaquinha tem status: ativa, desativada (perdida ou trocada) ou
--     cancelada. Desativada e inexistente respondem igual na ficha.
--   • A ficha do pet tem três níveis: desligada (padrão), básica (nome,
--     espécie, raça, porte) e completa (+ alergias, condições e o PRIMEIRO
--     nome do tutor). Nunca telefone, endereço, sobrenome nem foto.
--   • Só o tutor liga ou amplia a ficha, pelo WhatsApp central, com o
--     consentimento novo 'ficha_publica'. O painel só desliga a ficha e
--     desativa a plaquinha. Sem consentimento ativo, a ficha aparece
--     desligada, seja qual for o nível gravado.
--   • "Achei este pet": quem achou fala com o NÚMERO CENTRAL do PetCare Hub
--     (canais_plataforma, função 'achados'). O bot repassa o número e o
--     recado de quem achou direto ao tutor. Quem achou não vê nada do tutor,
--     e nenhum pet shop entra no caminho. 1 aviso por plaquinha a cada 30 min.
--   • O número central fica no banco, não no QR: trocar o chip não exige
--     reimprimir plaquinha.
--
-- Substitui pets.ficha_publica (jsonb do 02) por pets.ficha_nivel.
-- Rode depois do 20. Idempotente.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Código curto da plaquinha
-- ---------------------------------------------------------------------
-- Alfabeto Crockford: 32 símbolos. 256 % 32 = 0, então cada byte vira um
-- símbolo sem viés. 32^6 ≈ 1,07 bilhão de códigos.
create or replace function private.gerar_codigo_plaquinha() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_alfa constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea;
  v_cod text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_cod := '';
    for i in 0..5 loop
      v_cod := v_cod || substr(v_alfa, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.plaquinhas where codigo = v_cod);
  end loop;
  return v_cod;
end $$;

-- Normaliza o que veio na URL ou no WhatsApp: maiúsculas, sem espaço nem
-- hífen, e as trocas do Crockford (O→0, I e L→1). Devolve null se não for
-- um código válido.
create or replace function private.normalizar_codigo(p text) returns text
language sql immutable set search_path = '' as $$
  select case when c ~ '^[0-9A-HJKMNP-TV-Z]{6}$' then c end
    from (select translate(upper(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')), 'OIL', '011') as c) x;
$$;

-- Códigos antigos (10 hex do arquivo 02) ganham código novo. Ainda não há
-- plaquinha gravada com o formato antigo (09/11/2026).
do $$
declare r record; n int := 0;
begin
  for r in select id from public.plaquinhas where codigo !~ '^[0-9A-HJKMNP-TV-Z]{6}$' loop
    update public.plaquinhas set codigo = private.gerar_codigo_plaquinha() where id = r.id;
    n := n + 1;
  end loop;
  if n > 0 then raise notice 'Plaquinhas com código antigo regeneradas: %', n; end if;
end $$;

alter table public.plaquinhas alter column codigo set default private.gerar_codigo_plaquinha();
alter table public.plaquinhas drop constraint if exists plaquinhas_codigo_formato_check;
alter table public.plaquinhas add constraint plaquinhas_codigo_formato_check
  check (codigo ~ '^[0-9A-HJKMNP-TV-Z]{6}$');

-- ---------------------------------------------------------------------
-- 2. Status da plaquinha (substitui qr_ativo)
-- ---------------------------------------------------------------------
alter table public.plaquinhas add column if not exists status text not null default 'ativa';
alter table public.plaquinhas drop constraint if exists plaquinhas_status_check;
alter table public.plaquinhas add constraint plaquinhas_status_check
  check (status in ('ativa','desativada','cancelada'));
alter table public.plaquinhas add column if not exists status_alterado_em timestamptz;
alter table public.plaquinhas add column if not exists status_motivo text;
alter table public.plaquinhas add column if not exists status_origem text
  check (status_origem in ('bot','painel','admin','sistema'));
alter table public.plaquinhas add column if not exists status_por uuid references auth.users(id) on delete set null;
alter table public.plaquinhas add column if not exists leituras int not null default 0;
alter table public.plaquinhas add column if not exists ultima_leitura_em timestamptz;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'plaquinhas'
                and column_name = 'qr_ativo' and is_generated = 'NEVER') then
    update public.plaquinhas set status = 'desativada', status_origem = 'sistema', status_alterado_em = now()
     where not qr_ativo and status = 'ativa';
    alter table public.plaquinhas drop column qr_ativo;
  end if;
end $$;
-- Compatibilidade de leitura para quem ainda consulta qr_ativo.
alter table public.plaquinhas add column if not exists qr_ativo boolean
  generated always as (status = 'ativa') stored;

create index if not exists plaquinhas_petshop_idx on public.plaquinhas (petshop_id);

-- O 07 deixava o pet shop inserir e alterar plaquinhas direto ("for all").
-- Agora o código nasce em admin_gerar_plaquinha e o status muda pelas
-- funções do painel e do bot. Fica só a leitura (plaquinhas_ler, do 07).
drop policy if exists plaquinhas_escrever on public.plaquinhas;

-- ---------------------------------------------------------------------
-- 3. Nível da ficha no pet (substitui pets.ficha_publica jsonb)
-- ---------------------------------------------------------------------
alter table public.pets add column if not exists ficha_nivel text not null default 'desligada';
alter table public.pets drop constraint if exists pets_ficha_nivel_check;
alter table public.pets add constraint pets_ficha_nivel_check
  check (ficha_nivel in ('desligada','basica','completa'));
alter table public.pets add column if not exists ficha_alterada_em timestamptz;
alter table public.pets add column if not exists ficha_alterada_origem text
  check (ficha_alterada_origem in ('bot','painel','sistema'));
alter table public.pets add column if not exists ficha_alterada_por uuid references auth.users(id) on delete set null;
alter table public.pets drop column if exists ficha_publica;

-- ---------------------------------------------------------------------
-- 4. Proteções: nível da ficha e status da plaquinha só mudam pelas
--    funções deste arquivo (que ligam a flag da transação). Motivo: a RLS
--    deixa o pet shop editar o pet; sem isto, um UPDATE direto ligaria a
--    ficha completa sem o tutor ter escolhido.
-- ---------------------------------------------------------------------
create or replace function private.ficha_via_funcao() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('petcare.ficha_rpc', true), '') = 'on';
$$;

create or replace function private.proteger_ficha_pet() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ficha_nivel is distinct from old.ficha_nivel and not private.ficha_via_funcao() then
    raise exception 'O nível da ficha pública só muda pelo tutor (WhatsApp) ou pelo botão Desligar do painel'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists pets_proteger_ficha on public.pets;
create trigger pets_proteger_ficha before update of ficha_nivel on public.pets
  for each row execute function private.proteger_ficha_pet();

create or replace function private.proteger_plaquinha() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.codigo is distinct from old.codigo then
      raise exception 'O código da plaquinha não muda: ele está gravado no metal' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if not private.ficha_via_funcao() then
        raise exception 'Status da plaquinha só muda pelas funções de plaquinha' using errcode = '42501';
      end if;
      if old.status = 'cancelada' then
        raise exception 'Plaquinha cancelada não volta a valer' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists plaquinhas_proteger on public.plaquinhas;
create trigger plaquinhas_proteger before update on public.plaquinhas
  for each row execute function private.proteger_plaquinha();

-- ---------------------------------------------------------------------
-- 5. Consentimento 'ficha_publica' e termo (rascunho até a revisão jurídica)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select c.conrelid::regclass as t, c.conname from pg_constraint c
            where c.contype = 'c'
              and c.conrelid in ('public.consentimentos'::regclass, 'public.termos_consentimento'::regclass)
              and pg_get_constraintdef(c.oid) ~ '\mescopo\M'
  loop
    execute format('alter table %s drop constraint %I', r.t, r.conname);
  end loop;
end $$;
alter table public.consentimentos add constraint consentimentos_escopo_check
  check (escopo in ('compartilhar_dados_pet','compartilhar_saude','ficha_publica'));
alter table public.termos_consentimento add constraint termos_consentimento_escopo_check
  check (escopo in ('compartilhar_dados_pet','compartilhar_saude','ficha_publica'));

insert into public.termos_consentimento (versao, escopo, canal, texto, vigente)
values ('ficha-v0-rascunho-2026-11', 'ficha_publica', 'bot',
'A plaquinha de {pet} tem um QR. Quem ler o QR vê a ficha de {pet} e pode avisar você pelo PetCare Hub, sem ver o seu telefone.
Escolha o que a ficha mostra:
*1* · Básica: nome, espécie, raça e porte
*2* · Completa: a básica + alergias, condições de saúde e o seu primeiro nome
*3* · Desligada: só o botão para avisar você
*4* · Perdi a plaquinha (ela para de funcionar)

Seu telefone, endereço e sobrenome nunca aparecem. Você pode mudar quando quiser mandando FICHA {codigo}.',
 true)
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- 6. Canal da plataforma: número central de achados
--    Não é de pet shop nenhum. Uma linha por função ('achados').
-- ---------------------------------------------------------------------
create table if not exists public.canais_plataforma (
  funcao                 text primary key check (funcao in ('achados')),
  canal                  text not null default 'evolution' check (canal in ('evolution','teste')),
  instancia              text unique check (instancia ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  telefone_wp            text check (telefone_wp ~ '^\+[1-9][0-9]{7,14}$'),
  ativo                  boolean not null default false,
  conexao_status         text not null default 'desconectado' check (conexao_status in ('desconectado','conectado','erro')),
  conexao_verificada_em  timestamptz,
  conexao_alertado_em    timestamptz,
  atualizado_em          timestamptz not null default now(),
  check (canal <> 'evolution' or instancia is not null)
);
drop trigger if exists canais_plataforma_atualizado on public.canais_plataforma;
create trigger canais_plataforma_atualizado before update on public.canais_plataforma
  for each row execute function private.tocar_atualizado_em();
alter table public.canais_plataforma enable row level security;
drop policy if exists canais_plataforma_ler on public.canais_plataforma;
create policy canais_plataforma_ler on public.canais_plataforma for select to authenticated
  using ((select private.eh_super_admin()));
revoke all on public.canais_plataforma from anon, authenticated;
grant select on public.canais_plataforma to authenticated;
grant all on public.canais_plataforma to service_role;

-- A mesma instância não pode ser de um pet shop e da plataforma: o webhook
-- não saberia para quem rotear.
create or replace function private.instancia_sem_conflito() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.instancia is null then return new; end if;
  if tg_table_name = 'canais_plataforma'
     and exists (select 1 from public.bot_config where coalesce(instancia, zapi_instance_id) = new.instancia) then
    raise exception 'Instância % já é de um pet shop', new.instancia using errcode = '23505';
  end if;
  if tg_table_name = 'bot_config'
     and exists (select 1 from public.canais_plataforma where instancia = new.instancia) then
    raise exception 'Instância % é do número central do PetCare Hub', new.instancia using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists canais_plataforma_instancia on public.canais_plataforma;
create trigger canais_plataforma_instancia before insert or update of instancia on public.canais_plataforma
  for each row execute function private.instancia_sem_conflito();
drop trigger if exists bot_config_instancia_plataforma on public.bot_config;
create trigger bot_config_instancia_plataforma before insert or update of instancia on public.bot_config
  for each row execute function private.instancia_sem_conflito();

-- Conversa no número central: curta (ACHEI ou FICHA). Uma linha por telefone.
create table if not exists public.central_conversas (
  telefone       text primary key check (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  estado         text not null default 'idle' check (estado in ('idle','aguardando_ficha')),
  dados          jsonb not null default '{}',
  atualizado_em  timestamptz not null default now()
);
alter table public.central_conversas enable row level security;
revoke all on public.central_conversas from anon, authenticated;
grant all on public.central_conversas to service_role;

-- ---------------------------------------------------------------------
-- 7. Achados: registro de cada aviso. Só a Harpia lê. Guardado 90 dias.
--    Telefone de quem achou e recado: quem achou mandou pelo próprio
--    WhatsApp sabendo que iriam para o tutor (texto na página).
-- ---------------------------------------------------------------------
create table if not exists public.achados (
  id                uuid primary key default gen_random_uuid(),
  plaquinha_id      uuid references public.plaquinhas(id) on delete set null,
  pet_id            uuid references public.pets(id) on delete set null,
  telefone_achador  text not null,
  mensagem          text,
  resultado         text not null check (resultado in ('encaminhado','limite','indisponivel','proprio')),
  evidencia         jsonb not null default '{}',
  criado_em         timestamptz not null default now()
);
create index if not exists achados_plaquinha_idx on public.achados (plaquinha_id, criado_em desc);
create index if not exists achados_achador_idx on public.achados (telefone_achador, criado_em desc);
alter table public.achados enable row level security;
drop policy if exists achados_ler on public.achados;
create policy achados_ler on public.achados for select to authenticated
  using ((select private.eh_super_admin()));
revoke all on public.achados from anon, authenticated;
grant select on public.achados to authenticated;
grant all on public.achados to service_role;

-- ---------------------------------------------------------------------
-- 8. Ficha pública (anon). Única porta da página pet.petcarehub.com.br.
--    Sempre o mesmo formato. Código inexistente, desativado ou cancelado:
--    {"estado":"indisponivel"}, sem dizer qual dos três.
--    VOLATILE: conta a leitura (métrica da POC).
--    Varredura de códigos não compensa: com ~1 bilhão de combinações e
--    poucos milhares de plaquinhas, achar uma por sorte exige centenas de
--    milhares de chamadas, e cada acerto entrega no máximo o que o tutor
--    escolheu mostrar.
-- ---------------------------------------------------------------------
create or replace function private.nivel_efetivo(p_pet public.pets) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_pet.ficha_nivel <> 'desligada' and private.tutor_consente(p_pet.tutor_id, 'ficha_publica')
              then p_pet.ficha_nivel else 'desligada' end;
$$;

create or replace function private.contato_achados() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when cp.ativo and cp.telefone_wp is not null
              then jsonb_build_object('whatsapp', regexp_replace(cp.telefone_wp, '\D', '', 'g')) end
    from public.canais_plataforma cp where cp.funcao = 'achados';
$$;

create or replace function public.ficha_publica(p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cod   text := private.normalizar_codigo(p_ref);
  v_plq   public.plaquinhas;
  v_pet   public.pets;
  v_nivel text;
  v_out   jsonb;
  v_tutor text;
begin
  if v_cod is not null then
    select * into v_plq from public.plaquinhas where codigo = v_cod and status = 'ativa';
  end if;
  if v_plq.id is null or v_plq.pet_id is null then
    return jsonb_build_object('estado', 'indisponivel');
  end if;
  select * into v_pet from public.pets where id = v_plq.pet_id;

  update public.plaquinhas set leituras = leituras + 1, ultima_leitura_em = now() where id = v_plq.id;

  v_nivel := private.nivel_efetivo(v_pet);
  v_out := jsonb_build_object('estado', v_nivel, 'codigo', v_plq.codigo, 'contato', private.contato_achados());
  if v_nivel = 'desligada' then return v_out; end if;

  v_out := v_out || jsonb_build_object('pet', jsonb_strip_nulls(jsonb_build_object(
    'nome', v_pet.nome, 'especie', v_pet.especie, 'raca', v_pet.raca, 'porte', v_pet.porte)));
  if v_nivel = 'completa' then
    -- Primeiro nome do tutor: do vínculo com o pet shop que entregou a
    -- plaquinha; sem ele, do vínculo mais recente.
    select split_part(trim(tp.nome), ' ', 1) into v_tutor
      from public.tutor_petshop tp
     where tp.tutor_id = v_pet.tutor_id and tp.nome <> 'Sem nome'
     order by (tp.petshop_id is not distinct from v_plq.petshop_id) desc, tp.criado_em desc
     limit 1;
    v_out := jsonb_set(v_out, '{pet}', (v_out -> 'pet') || jsonb_strip_nulls(jsonb_build_object(
      'alergias', nullif(trim(v_pet.alergias), ''), 'condicoes', nullif(trim(v_pet.condicoes), ''),
      'tutor', nullif(v_tutor, ''))));
  end if;
  return v_out;
end $$;

-- ---------------------------------------------------------------------
-- 9. Funções do bot no número central (só service_role)
-- ---------------------------------------------------------------------
-- Roteamento: a instância que recebeu a mensagem é do número central?
create or replace function public.bot_canal_plataforma(p_canal text, p_instancia text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('funcao', cp.funcao, 'canal', cp.canal, 'instancia', cp.instancia, 'ativo', cp.ativo)
    from public.canais_plataforma cp
   where p_instancia is not null and cp.instancia = p_instancia and cp.canal = p_canal;
$$;

-- Dados de envio do número central, no mesmo formato de bot_envio.
create or replace function public.bot_envio_plataforma(p_funcao text default 'achados') returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('canal', cp.canal, 'instancia', cp.instancia, 'telefone', cp.telefone_wp,
                            'conexao_status', cp.conexao_status, 'ativo', cp.ativo)
    from public.canais_plataforma cp where cp.funcao = p_funcao;
$$;

-- Entrada de cada mensagem no número central. Conversa parada há mais de
-- 2 horas volta ao início. Aproveita para apagar o que passou do prazo.
create or replace function public.bot_central_entrada(p_telefone text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tel  text := private.normalizar_telefone(p_telefone);
  v_conv public.central_conversas;
begin
  delete from public.achados where criado_em < now() - interval '90 days';
  delete from public.central_conversas where atualizado_em < now() - interval '30 days';
  insert into public.central_conversas (telefone) values (v_tel)
  on conflict (telefone) do update set telefone = excluded.telefone
  returning * into v_conv;
  if v_conv.estado <> 'idle' and v_conv.atualizado_em < now() - interval '2 hours' then
    v_conv.estado := 'idle'; v_conv.dados := '{}';
  end if;
  return jsonb_build_object('estado', v_conv.estado, 'dados', v_conv.dados);
end $$;

create or replace function public.bot_central_salvar(p_telefone text, p_estado text, p_dados jsonb default '{}') returns void
language sql volatile security definer set search_path = '' as $$
  update public.central_conversas
     set estado = p_estado, dados = case when p_estado = 'idle' then '{}'::jsonb else coalesce(p_dados, '{}') end,
         atualizado_em = now()
   where telefone = private.normalizar_telefone(p_telefone);
$$;

-- ACHEI {codigo} {recado}. Decide e registra; o motor monta as mensagens.
--   encaminhar: manda ao tutor (telefone_tutor) o número e o recado.
--   limite: já houve aviso desta plaquinha há menos de 30 min, ou quem
--           achou passou de 10 avisos em 24 h.
--   indisponivel: código inexistente, desativado ou sem pet.
--   proprio: quem escreveu é o próprio tutor (teste da plaquinha).
create or replace function public.bot_achado_registrar(
  p_codigo text, p_telefone text, p_mensagem text default null, p_evidencia jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cod   text := private.normalizar_codigo(p_codigo);
  v_tel   text := private.normalizar_telefone(p_telefone);
  v_msg   text := nullif(left(trim(coalesce(p_mensagem, '')), 500), '');
  v_plq   public.plaquinhas;
  v_pet   public.pets;
  v_tutor text;
  v_res   text;
  v_nivel text;
begin
  if v_cod is not null then
    select * into v_plq from public.plaquinhas where codigo = v_cod and status = 'ativa';
  end if;
  if v_plq.id is not null and v_plq.pet_id is not null then
    select * into v_pet from public.pets where id = v_plq.pet_id;
    select telefone into v_tutor from public.tutores where id = v_pet.tutor_id;
  end if;

  if v_tutor is null then
    v_res := 'indisponivel';
  elsif v_tutor = v_tel then
    v_res := 'proprio';
  elsif exists (select 1 from public.achados where plaquinha_id = v_plq.id and resultado = 'encaminhado'
                 and criado_em > now() - interval '30 minutes')
     or (select count(*) from public.achados where telefone_achador = v_tel and resultado = 'encaminhado'
          and criado_em > now() - interval '24 hours') >= 10 then
    v_res := 'limite';
  else
    v_res := 'encaminhado';
  end if;

  insert into public.achados (plaquinha_id, pet_id, telefone_achador, mensagem, resultado, evidencia)
  values (v_plq.id, v_pet.id, v_tel, v_msg, v_res, coalesce(p_evidencia, '{}'));

  if v_res <> 'encaminhado' then
    return jsonb_build_object('resultado', v_res);
  end if;
  v_nivel := private.nivel_efetivo(v_pet);
  return jsonb_build_object(
    'resultado', v_res,
    'telefone_tutor', v_tutor,
    'pet_nome', v_pet.nome,                                            -- vai só para o tutor
    'pet_nome_publico', case when v_nivel <> 'desligada' then v_pet.nome end,  -- pode ir para quem achou
    'codigo', v_plq.codigo,
    'telefone_achador', v_tel,
    'mensagem', v_msg);
end $$;

-- FICHA {codigo}: o tutor quer ver ou mudar a ficha. Confere que o
-- telefone é do tutor do pet e devolve o nível atual e o termo vigente.
create or replace function public.bot_ficha_consultar(p_codigo text, p_telefone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cod  text := private.normalizar_codigo(p_codigo);
  v_tel  text := private.normalizar_telefone(p_telefone);
  v_plq  public.plaquinhas;
  v_pet  public.pets;
  v_termo record;
begin
  if v_cod is not null then
    select * into v_plq from public.plaquinhas where codigo = v_cod and status = 'ativa';
  end if;
  if v_plq.id is null or v_plq.pet_id is null then
    return jsonb_build_object('resultado', 'indisponivel');
  end if;
  select * into v_pet from public.pets where id = v_plq.pet_id;
  if not exists (select 1 from public.tutores where id = v_pet.tutor_id and telefone = v_tel) then
    -- Mesma resposta de código inexistente: não confirma para estranhos
    -- que aquele código existe e a quem pertence.
    return jsonb_build_object('resultado', 'nao_tutor');
  end if;
  select versao, texto into v_termo from public.termos_consentimento
   where escopo = 'ficha_publica' and canal = 'bot' and vigente;
  return jsonb_build_object(
    'resultado', 'ok', 'codigo', v_plq.codigo, 'pet_nome', v_pet.nome,
    'nivel', private.nivel_efetivo(v_pet),
    'termo_versao', v_termo.versao, 'termo_texto', v_termo.texto);
end $$;

-- Escolha do tutor: basica, completa, desligada ou perdida.
-- Básica e completa gravam o consentimento 'ficha_publica' (se ainda não
-- houver um ativo) com a versão do termo, canal e evidência.
create or replace function public.bot_ficha_definir(
  p_codigo text, p_telefone text, p_escolha text, p_versao text, p_evidencia jsonb default '{}') returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cod text := private.normalizar_codigo(p_codigo);
  v_tel text := private.normalizar_telefone(p_telefone);
  v_plq public.plaquinhas;
  v_pet public.pets;
begin
  if p_escolha not in ('basica','completa','desligada','perdida') then
    raise exception 'Escolha inválida: %', p_escolha using errcode = '22023';
  end if;
  if v_cod is not null then
    select * into v_plq from public.plaquinhas where codigo = v_cod and status = 'ativa';
  end if;
  if v_plq.id is null then return 'indisponivel'; end if;
  select * into v_pet from public.pets where id = v_plq.pet_id;
  if v_pet.id is null or not exists (select 1 from public.tutores where id = v_pet.tutor_id and telefone = v_tel) then
    return 'nao_tutor';
  end if;

  perform set_config('petcare.ficha_rpc', 'on', true);
  if p_escolha = 'perdida' then
    update public.plaquinhas
       set status = 'desativada', status_motivo = 'perdida (tutor pelo WhatsApp)', status_origem = 'bot',
           status_alterado_em = now(), status_por = null
     where id = v_plq.id;
  else
    if p_escolha in ('basica','completa') then
      if not exists (select 1 from public.termos_consentimento where versao = p_versao and escopo = 'ficha_publica') then
        raise exception 'Versão de termo desconhecida: %', p_versao using errcode = '22023';
      end if;
      insert into public.consentimentos (tutor_id, escopo, versao_termo, canal, petshop_origem_id, evidencia)
      select v_pet.tutor_id, 'ficha_publica', p_versao, 'bot', v_plq.petshop_id,
             coalesce(p_evidencia, '{}') || jsonb_build_object('nivel', p_escolha, 'codigo', v_plq.codigo)
       where not private.tutor_consente(v_pet.tutor_id, 'ficha_publica');
    end if;
    update public.pets
       set ficha_nivel = p_escolha, ficha_alterada_em = now(), ficha_alterada_origem = 'bot', ficha_alterada_por = null
     where id = v_pet.id;
  end if;
  perform set_config('petcare.ficha_rpc', 'off', true);
  return p_escolha;
end $$;

-- ---------------------------------------------------------------------
-- 10. Painel (authenticated; papel conferido em cada função)
-- ---------------------------------------------------------------------
-- Plaquinhas e ficha de um pet vinculado ao pet shop. Só leitura.
create or replace function public.painel_plaquinhas_pet(p_petshop uuid, p_pet uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_pet public.pets; v_cons record;
begin
  perform private.exigir_papel(p_petshop, private.papeis_operacao());
  if not exists (select 1 from public.pet_petshop where pet_id = p_pet and petshop_id = p_petshop) then
    raise exception 'Pet não vinculado a este pet shop' using errcode = '42501';
  end if;
  select * into v_pet from public.pets where id = p_pet;
  select concedido_em, versao_termo into v_cons from public.consentimentos
   where tutor_id = v_pet.tutor_id and escopo = 'ficha_publica' and revogado_em is null;
  return jsonb_build_object(
    'ficha_nivel', private.nivel_efetivo(v_pet),
    'ficha_alterada_em', v_pet.ficha_alterada_em,
    'ficha_alterada_origem', v_pet.ficha_alterada_origem,
    'consentimento', case when v_cons.concedido_em is not null
                          then jsonb_build_object('concedido_em', v_cons.concedido_em, 'versao', v_cons.versao_termo) end,
    'plaquinhas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'codigo', q.codigo, 'kit', q.kit, 'material', q.material, 'status', q.status,
        'status_motivo', q.status_motivo, 'entregue_em', q.entregue_em, 'leituras', q.leituras,
        'deste_petshop', q.petshop_id is not distinct from p_petshop) order by q.criado_em desc)
      from public.plaquinhas q where q.pet_id = p_pet), '[]'::jsonb));
end $$;

-- Desligar a ficha a pedido do tutor (o painel nunca liga).
create or replace function public.painel_ficha_desligar(p_petshop uuid, p_pet uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.exigir_papel(p_petshop, private.papeis_operacao());
  if not exists (select 1 from public.pet_petshop where pet_id = p_pet and petshop_id = p_petshop) then
    raise exception 'Pet não vinculado a este pet shop' using errcode = '42501';
  end if;
  perform set_config('petcare.ficha_rpc', 'on', true);
  update public.pets
     set ficha_nivel = 'desligada', ficha_alterada_em = now(), ficha_alterada_origem = 'painel',
         ficha_alterada_por = auth.uid()
   where id = p_pet and ficha_nivel <> 'desligada';
  perform set_config('petcare.ficha_rpc', 'off', true);
end $$;

-- Desativar uma plaquinha (perdida ou trocada) a pedido do tutor.
create or replace function public.painel_plaquinha_desativar(p_petshop uuid, p_plaquinha uuid, p_motivo text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_pet uuid;
begin
  perform private.exigir_papel(p_petshop, private.papeis_operacao());
  select pet_id into v_pet from public.plaquinhas where id = p_plaquinha;
  if v_pet is null or not exists (select 1 from public.pet_petshop where pet_id = v_pet and petshop_id = p_petshop) then
    raise exception 'Plaquinha de pet não vinculado a este pet shop' using errcode = '42501';
  end if;
  perform set_config('petcare.ficha_rpc', 'on', true);
  update public.plaquinhas
     set status = 'desativada', status_motivo = left(coalesce(nullif(trim(p_motivo), ''), 'pedido do tutor'), 200),
         status_origem = 'painel', status_alterado_em = now(), status_por = auth.uid()
   where id = p_plaquinha and status = 'ativa';
  perform set_config('petcare.ficha_rpc', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- 11. Admin Harpia: gerar a plaquinha (código) antes de gravar.
--     Pode ser chamado pelo super admin no painel, pelo service_role ou
--     direto no SQL Editor (conexão sem JWT, só quem administra o banco).
-- ---------------------------------------------------------------------
create or replace function private.pode_admin_plaquinha() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.eh_super_admin()
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                  nullif(current_setting('request.jwt.claim.role', true), ''), 'sem_jwt') in ('service_role', 'sem_jwt');
$$;
create or replace function public.admin_gerar_plaquinha(
  p_petshop uuid, p_pet uuid, p_kit text, p_material text default null, p_valor numeric default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_cod text;
begin
  if not private.pode_admin_plaquinha() then
    raise exception 'Só a equipe Harpia gera plaquinhas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pet_petshop where pet_id = p_pet and petshop_id = p_petshop) then
    raise exception 'Pet não vinculado a este pet shop' using errcode = '22023';
  end if;
  insert into public.plaquinhas (pet_id, petshop_id, kit, material, valor)
  values (p_pet, p_petshop, p_kit, p_material, p_valor)
  returning codigo into v_cod;
  return v_cod;
end $$;

-- Para o lote do Craft: CSV com código, nome do pet e pet shop.
create or replace function public.admin_lote_plaquinhas(p_desde timestamptz default now() - interval '7 days') returns table (
  codigo text, pet text, petshop text, kit text, material text, criado_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.pode_admin_plaquinha() then
    raise exception 'Só a equipe Harpia' using errcode = '42501';
  end if;
  return query
    select q.codigo, p.nome, ps.nome, q.kit, q.material, q.criado_em
      from public.plaquinhas q
      join public.pets p on p.id = q.pet_id
      left join public.petshops ps on ps.id = q.petshop_id
     where q.criado_em >= p_desde and q.status = 'ativa' and q.entregue_em is null
     order by q.criado_em;
end $$;

-- ---------------------------------------------------------------------
-- 12. Conexão: o número central entra no cron de 15 min e no webhook.
--     Mesma assinatura do 19 (create or replace sem drop).
-- ---------------------------------------------------------------------
create or replace function public.bot_instancias_monitoradas() returns table (
  petshop_id uuid, petshop text, canal text, instancia text, ativo boolean)
language sql stable security definer set search_path = '' as $$
  select bc.petshop_id, ps.nome, bc.canal, coalesce(bc.instancia, bc.zapi_instance_id), bc.ativo
    from public.bot_config bc
    join public.petshops ps on ps.id = bc.petshop_id and ps.ativo
   where bc.canal in ('zapi','evolution')
     and coalesce(bc.instancia, bc.zapi_instance_id) is not null
  union all
  select null::uuid, 'PetCare Hub · número central (' || cp.funcao || ')', cp.canal, cp.instancia, cp.ativo
    from public.canais_plataforma cp
   where cp.canal = 'evolution' and cp.instancia is not null;
$$;

create or replace function public.bot_conexao_evento(
  p_instance text, p_conectado boolean, p_detalhe text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cfg    public.bot_config;
  v_cp     public.canais_plataforma;
  v_nome   text;
  v_novo   text := case when p_conectado then 'conectado' else 'desconectado' end;
  v_queda  boolean := false;
  v_volta  boolean := false;
  v_status text; v_alertado timestamptz; v_ativo boolean;
begin
  select * into v_cfg from public.bot_config
   where coalesce(instancia, zapi_instance_id) = p_instance limit 1;
  if v_cfg.petshop_id is not null then
    select nome into v_nome from public.petshops where id = v_cfg.petshop_id;
    v_status := v_cfg.conexao_status; v_alertado := v_cfg.conexao_alertado_em; v_ativo := v_cfg.ativo;
  else
    select * into v_cp from public.canais_plataforma where instancia = p_instance;
    if v_cp.funcao is null then
      return jsonb_build_object('encontrado', false);
    end if;
    v_nome := 'PetCare Hub · número central (' || v_cp.funcao || ')';
    v_status := v_cp.conexao_status; v_alertado := v_cp.conexao_alertado_em; v_ativo := v_cp.ativo;
  end if;

  if v_novo <> 'conectado' then
    v_queda := v_status = 'conectado' or v_alertado is null or v_alertado < now() - interval '6 hours';
  else
    v_volta := v_status <> 'conectado' and v_alertado is not null;
  end if;

  if v_cfg.petshop_id is not null then
    update public.bot_config
       set conexao_status = v_novo, conexao_verificada_em = now(),
           conexao_alertado_em = case when v_queda then now() when v_novo = 'conectado' then null else conexao_alertado_em end
     where petshop_id = v_cfg.petshop_id;
  else
    update public.canais_plataforma
       set conexao_status = v_novo, conexao_verificada_em = now(),
           conexao_alertado_em = case when v_queda then now() when v_novo = 'conectado' then null else conexao_alertado_em end
     where funcao = v_cp.funcao;
  end if;

  return jsonb_build_object(
    'encontrado', true, 'petshop_id', v_cfg.petshop_id, 'petshop', v_nome,
    'status', v_novo, 'anterior', v_status, 'bot_ativo', v_ativo,
    'alertar_queda', v_queda, 'alertar_volta', v_volta, 'detalhe', p_detalhe);
end $$;

-- ---------------------------------------------------------------------
-- 13. Permissões
-- ---------------------------------------------------------------------
revoke execute on function public.ficha_publica(text) from public;
grant execute on function public.ficha_publica(text) to anon, authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.bot_canal_plataforma(text, text)',
    'public.bot_envio_plataforma(text)',
    'public.bot_central_entrada(text)',
    'public.bot_central_salvar(text, text, jsonb)',
    'public.bot_achado_registrar(text, text, text, jsonb)',
    'public.bot_ficha_consultar(text, text)',
    'public.bot_ficha_definir(text, text, text, text, jsonb)',
    'public.bot_instancias_monitoradas()',
    'public.bot_conexao_evento(text, boolean, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.painel_plaquinhas_pet(uuid, uuid)',
    'public.painel_ficha_desligar(uuid, uuid)',
    'public.painel_plaquinha_desativar(uuid, uuid, text)',
    'public.admin_gerar_plaquinha(uuid, uuid, text, text, numeric)',
    'public.admin_lote_plaquinhas(timestamptz)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke execute on all functions in schema private from anon;

commit;

select 'Arquivo 21 aplicado: ficha pública, plaquinhas e número central de achados.' as resultado;
