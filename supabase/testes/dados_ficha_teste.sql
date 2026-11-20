-- =====================================================================
-- PetCare Hub · Dados de teste da ficha pública (depois do 21)
-- GRAVA (não desfaz): serve para abrir a página pet.petcarehub.com.br e
-- ver os três estados enquanto o número central não existe.
--   • Thor (Pet Feliz): plaquinha TH0R26 do seed, ficha DESLIGADA
--   • Mel  (Pet Feliz): ficha BÁSICA   (Carla consentiu)
--   • Bob  (Pata Amiga): ficha COMPLETA (Elisa consentiu; alergia a frango)
-- Os consentimentos usam o termo rascunho e evidência "dados de teste".
-- O arquivo 11 apaga tudo junto com os tutores de teste (cascade).
-- Pode rodar de novo: não duplica.
-- =====================================================================
begin;

do $$
declare
  pf     constant uuid := '11111111-1111-4111-8111-111111111111';
  pr     constant uuid := '22222222-2222-4222-8222-222222222222';
  carla  constant uuid := 'c0000000-0000-4000-8000-000000000001';
  elisa  constant uuid := 'c0000000-0000-4000-8000-000000000003';
  p_mel  constant uuid := 'd0000000-0000-4000-8000-000000000002';
  p_bob  constant uuid := 'd0000000-0000-4000-8000-000000000004';
  v_termo text;
begin
  select versao into v_termo from public.termos_consentimento where escopo = 'ficha_publica' and vigente;

  insert into public.consentimentos (tutor_id, escopo, versao_termo, canal, petshop_origem_id, evidencia)
  select t, 'ficha_publica', v_termo, 'bot', ps, '{"origem":"dados de teste"}'
    from (values (carla, pf), (elisa, pr)) x(t, ps)
   where not private.tutor_consente(t, 'ficha_publica');

  perform set_config('petcare.ficha_rpc', 'on', true);
  update public.pets set ficha_nivel = 'basica',   ficha_alterada_em = now(), ficha_alterada_origem = 'sistema' where id = p_mel;
  update public.pets set ficha_nivel = 'completa', ficha_alterada_em = now(), ficha_alterada_origem = 'sistema',
                         condicoes = coalesce(condicoes, 'Toma remédio para o coração') where id = p_bob;
  perform set_config('petcare.ficha_rpc', 'off', true);

  if not exists (select 1 from public.plaquinhas where pet_id = p_mel and status = 'ativa') then
    perform public.admin_gerar_plaquinha(pf, p_mel, 'essencial', 'aço pintado (teste)');
  end if;
  if not exists (select 1 from public.plaquinhas where pet_id = p_bob and status = 'ativa') then
    perform public.admin_gerar_plaquinha(pr, p_bob, 'metal', 'inox com spray (teste)');
  end if;
end $$;

commit;

-- Endereços para abrir no celular
select p.nome as pet, p.ficha_nivel as ficha, q.codigo,
       'https://pet.petcarehub.com.br/' || q.codigo as endereco
  from public.plaquinhas q join public.pets p on p.id = q.pet_id
 where q.status = 'ativa' and p.id in ('d0000000-0000-4000-8000-000000000001',
                                      'd0000000-0000-4000-8000-000000000002',
                                      'd0000000-0000-4000-8000-000000000004')
 order by p.nome;
