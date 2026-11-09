-- =====================================================================
-- PetCare Hub · 19 · Canal Evolution API (POC e plano Essencial)
-- Decisão de 09/11/2026: WhatsApp pela Evolution API (conexão por QR,
-- Baileys) no mesmo projeto Railway do N8n. Canal oficial (Omni) fica
-- para os planos superiores.
--
--   1. 'evolution' aceito em bot_config.canal e mensagens_log.canal
--   2. bot_config.instancia: nome da instância no provedor, neutro
--      (para a Evolution = slug do pet shop). zapi_instance_id fica como
--      legado até a Z-API sair de vez do código.
--   3. bot_envio devolve 'instancia'
--   4. bot_petshop_por_canal(canal, instancia): roteia o webhook
--   5. bot_instancias_monitoradas: Z-API e Evolution, sem token
--   6. bot_conexao_evento: procura pela instância nova ou pela antiga
--
-- Sem token no Vault para a Evolution: o N8n usa a chave global numa
-- credencial cifrada (mesmo nível de risco: quem tem o N8n já lê o Vault).
-- bot_registrar_fromme não muda: o id da Evolution (key.id) vai para
-- mensagens_log.id_externo como o da Z-API ia.
-- Rode depois do 18. Idempotente.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1 e 2. Canal e instância
--    Remove toda CHECK que cite a coluna canal (05 e 14 criaram com nomes
--    padrão, mas não dependemos deles) e recria com a lista completa.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tabela, c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.bot_config'::regclass, 'public.mensagens_log'::regclass)
       and pg_get_constraintdef(c.oid) ~ '\mcanal\M'
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end $$;

alter table public.bot_config add column if not exists instancia text;

alter table public.bot_config add constraint bot_config_canal_check
  check (canal in ('zapi','meta_oficial','teste','evolution'));
alter table public.mensagens_log add constraint mensagens_log_canal_check
  check (canal in ('zapi','meta_oficial','teste','evolution'));

-- Evolution sem instância não recebe nem envia nada.
alter table public.bot_config add constraint bot_config_canal_instancia_check
  check (canal <> 'evolution' or instancia is not null);

-- Nome da instância = slug do pet shop: minúsculas, números e hífen.
-- Vai na URL da Evolution (/message/sendText/{instancia}).
alter table public.bot_config drop constraint if exists bot_config_instancia_formato_check;
alter table public.bot_config add constraint bot_config_instancia_formato_check
  check (instancia is null or instancia ~ '^[a-z0-9][a-z0-9-]{1,62}$');

create unique index if not exists bot_config_instancia_uidx
  on public.bot_config (instancia) where instancia is not null;

-- ---------------------------------------------------------------------
-- 3. Dados de envio: 'instancia' neutra. zapi_instance_id e token ficam
--    para o simulador e o canal antigo.
-- ---------------------------------------------------------------------
create or replace function public.bot_envio(p_petshop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'canal', bc.canal,
           'instancia', coalesce(bc.instancia, bc.zapi_instance_id),
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
-- 4. Roteamento do webhook por canal + instância.
--    Função nova em vez de mudar bot_petshop_por_instancia: um parâmetro
--    a mais com default criaria sobrecarga, e o PostgREST recusa a
--    chamada ambígua (PGRST203).
-- ---------------------------------------------------------------------
create or replace function public.bot_petshop_por_canal(p_canal text, p_instancia text)
returns uuid
language sql stable security definer set search_path = '' as $$
  select bc.petshop_id
    from public.bot_config bc
   where bc.canal = p_canal
     and p_instancia is not null
     and coalesce(bc.instancia, bc.zapi_instance_id) = p_instancia
   limit 1;
$$;

-- ---------------------------------------------------------------------
-- 5. Instâncias para o cron de conexão. Muda o tipo de retorno: precisa
--    de drop. Não devolve token: a Evolution é consultada com a chave
--    global da credencial do N8n.
-- ---------------------------------------------------------------------
drop function if exists public.bot_instancias_monitoradas();
create function public.bot_instancias_monitoradas() returns table (
  petshop_id uuid, petshop text, canal text, instancia text, ativo boolean)
language sql stable security definer set search_path = '' as $$
  select bc.petshop_id, ps.nome, bc.canal, coalesce(bc.instancia, bc.zapi_instance_id), bc.ativo
    from public.bot_config bc
    join public.petshops ps on ps.id = bc.petshop_id and ps.ativo
   where bc.canal in ('zapi','evolution')
     and coalesce(bc.instancia, bc.zapi_instance_id) is not null;
$$;

-- ---------------------------------------------------------------------
-- 6. Conexão: mesma regra de alerta do 13, procurando pela instância
--    nova ou pela antiga.
-- ---------------------------------------------------------------------
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
  select * into v_cfg from public.bot_config
   where coalesce(instancia, zapi_instance_id) = p_instance
   limit 1;
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
-- Permissões: só o service_role (secret key n8n-bot)
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.bot_envio(uuid)',
    'public.bot_petshop_por_canal(text, text)',
    'public.bot_instancias_monitoradas()',
    'public.bot_conexao_evento(text, boolean, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;

select 'Arquivo 19 aplicado: canal Evolution API.' as resultado;
