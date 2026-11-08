-- =====================================================================
-- PetCare Hub · 16 · Consentimento e opt-out pelo bot (TP-12 e TP-15)
-- Decisões de 08/11/2026:
--   • o bot pede o consentimento 'compartilhar_dados_pet' (dados básicos do
--     pet e nome do tutor) DEPOIS do primeiro agendamento, uma vez por pet shop;
--   • saúde ('compartilhar_saude') fica para o módulo Vet; marketing, para o F2;
--   • SAIR, PARAR ou STOP desligam as mensagens automáticas daquele pet shop;
--     ATIVAR religa; REVOGAR desfaz o consentimento de compartilhamento.
-- O texto do termo fica no banco (termos_consentimento), com versão: trocar o
-- texto depois da revisão jurídica é inserir uma versão nova, sem mexer no bot.
-- Rode depois do 15. Pode rodar de novo.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Estado novo da conversa
-- ---------------------------------------------------------------------
alter table public.bot_conversas drop constraint if exists bot_conversas_estado_check;
alter table public.bot_conversas add constraint bot_conversas_estado_check check (estado in (
  'novo','idle','menu',
  'aguardando_nome','aguardando_pet','aguardando_nome_pet','aguardando_porte','aguardando_servico',
  'aguardando_data','aguardando_hora','aguardando_confirmacao','aguardando_cancelamento',
  'aguardando_consentimento',
  'humano','bloqueado'));

-- ---------------------------------------------------------------------
-- 2. Pergunta feita (uma vez por pet shop), aceita ou não
-- ---------------------------------------------------------------------
alter table public.tutor_petshop add column if not exists consentimento_perguntado_em timestamptz;

-- ---------------------------------------------------------------------
-- 3. Termos com versão. Só um vigente por escopo e canal.
--    {petshop} e {pet} são trocados pelo bot.
-- ---------------------------------------------------------------------
create table if not exists public.termos_consentimento (
  versao      text primary key,
  escopo      text not null check (escopo in ('compartilhar_dados_pet','compartilhar_saude')),
  canal       text not null default 'bot' check (canal in ('bot','painel','presencial','app')),
  texto       text not null,
  vigente     boolean not null default false,
  criado_em   timestamptz not null default now()
);
create unique index if not exists termos_vigente_uidx on public.termos_consentimento (escopo, canal) where vigente;
alter table public.termos_consentimento enable row level security;
drop policy if exists termos_ler on public.termos_consentimento;
create policy termos_ler on public.termos_consentimento for select to authenticated using (true);
revoke all on public.termos_consentimento from anon;
grant select on public.termos_consentimento to authenticated;
grant all on public.termos_consentimento to service_role;

-- Rascunho até a revisão jurídica (pendência 18 do documento-mestre).
insert into public.termos_consentimento (versao, escopo, canal, texto, vigente)
values ('bot-v0-rascunho-2026-11', 'compartilhar_dados_pet', 'bot',
'Uma pergunta rápida 🐾 O {petshop} usa o PetCare Hub. Posso deixar os dados básicos do {pet} (nome, espécie, raça, porte e nascimento) e o seu nome disponíveis para outros pet shops e clínicas do PetCare Hub que você visitar? Assim você não precisa cadastrar tudo de novo, e quem encontrar o {pet} sabe de quem ele é.
Banho, tosa, preços e o seu histórico aqui não são compartilhados.

Responda *SIM* ou *NÃO*. Você pode desfazer quando quiser respondendo *REVOGAR*.',
 true)
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- 4. Funções do bot (só service_role)
-- ---------------------------------------------------------------------
-- Perguntar? Só se o tutor tem vínculo aqui, não tem consentimento ativo e
-- ainda não foi perguntado neste pet shop. Devolve o termo vigente ou null.
create or replace function public.bot_consentimento_pendente(p_petshop uuid, p_tutor uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('versao', t.versao, 'texto', t.texto)
    from public.tutor_petshop tp
    join public.termos_consentimento t on t.escopo = 'compartilhar_dados_pet' and t.canal = 'bot' and t.vigente
   where tp.tutor_id = p_tutor and tp.petshop_id = p_petshop
     and tp.consentimento_perguntado_em is null
     and not private.tutor_consente(p_tutor, 'compartilhar_dados_pet');
$$;

-- Registra a resposta. SIM grava o consentimento com versão, canal e evidência.
-- NÃO (ou resposta fora de SIM/NÃO) só marca que já perguntou.
create or replace function public.bot_registrar_consentimento(
  p_petshop uuid, p_tutor uuid, p_aceite boolean, p_versao text, p_evidencia jsonb default '{}') returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.tutor_petshop set consentimento_perguntado_em = now()
   where tutor_id = p_tutor and petshop_id = p_petshop;
  if not found then
    raise exception 'Tutor sem vínculo com este pet shop' using errcode = '42501';
  end if;
  if not p_aceite then return 'recusado'; end if;
  if not exists (select 1 from public.termos_consentimento where versao = p_versao) then
    raise exception 'Versão de termo desconhecida: %', p_versao using errcode = '22023';
  end if;
  insert into public.consentimentos (tutor_id, escopo, versao_termo, canal, petshop_origem_id, evidencia)
  select p_tutor, 'compartilhar_dados_pet', p_versao, 'bot', p_petshop, coalesce(p_evidencia, '{}')
   where not private.tutor_consente(p_tutor, 'compartilhar_dados_pet');
  return 'concedido';
end $$;

-- REVOGAR: desfaz o consentimento ativo. Os dados clínicos e os pets de outros
-- pet shops somem na hora (as políticas e o bot leem o consentimento).
create or replace function public.bot_revogar_consentimento(p_tutor uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.consentimentos set revogado_em = now()
   where tutor_id = p_tutor and escopo = 'compartilhar_dados_pet' and revogado_em is null;
  return found;
end $$;

-- SAIR/PARAR/STOP (false) e ATIVAR (true): mensagens automáticas deste pet shop.
-- Devolve false se o telefone não tem vínculo aqui.
create or replace function public.bot_definir_mensagens(p_petshop uuid, p_telefone text, p_aceita boolean) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.tutor_petshop tp
     set aceita_mensagens = p_aceita,
         opt_out_em = case when p_aceita then null else now() end
    from public.tutores t
   where t.id = tp.tutor_id and tp.petshop_id = p_petshop
     and t.telefone = private.normalizar_telefone(p_telefone);
  return found;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.bot_consentimento_pendente(uuid, uuid)',
    'public.bot_registrar_consentimento(uuid, uuid, boolean, text, jsonb)',
    'public.bot_revogar_consentimento(uuid)',
    'public.bot_definir_mensagens(uuid, text, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;

select 'Arquivo 16 aplicado: consentimento e opt-out pelo bot.' as resultado;
