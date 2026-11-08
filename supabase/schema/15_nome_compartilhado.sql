-- =====================================================================
-- PetCare Hub · 15 · Nome do tutor compartilhado com consentimento
-- Decisão de 08/11/2026: com o consentimento 'compartilhar_dados_pet', o nome
-- do tutor faz parte dos dados compartilhados (quem achar o pet precisa saber
-- de quem ele é; o bot cumprimenta pelo nome no primeiro contato).
--   bot_nome_compartilhado(tutor): nome do vínculo mais recente do tutor com
--   qualquer pet shop, só se o consentimento estiver ativo. Sem consentimento: null.
-- Mesma origem do nome que bot_vincular_pet_compartilhado (arquivo 05) já usa.
-- Rode depois do 14. Pode rodar de novo.
-- =====================================================================
begin;

create or replace function public.bot_nome_compartilhado(p_tutor uuid) returns text
language sql stable security definer set search_path = '' as $$
  select tp.nome
    from public.tutor_petshop tp
   where tp.tutor_id = p_tutor
     and private.tutor_consente(p_tutor, 'compartilhar_dados_pet')
     and nullif(trim(tp.nome), '') is not null and tp.nome <> 'Sem nome'
   order by tp.criado_em desc
   limit 1;
$$;

revoke execute on function public.bot_nome_compartilhado(uuid) from public, anon, authenticated;
grant execute on function public.bot_nome_compartilhado(uuid) to service_role;

commit;

select 'Arquivo 15 aplicado: nome do tutor compartilhado com consentimento.' as resultado;
