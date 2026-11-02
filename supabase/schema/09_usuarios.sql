-- =====================================================================
-- PetCare Hub · 09 · Vincular usuários de login
-- ANTES: crie os usuários em Authentication → Users → Add user
-- (marque "Auto Confirm User"). Troque os e-mails abaixo se quiser.
--   • seu e-mail                → super admin Harpia
--   • dono.petfeliz@teste.local → dono do Pet Feliz (teste)
--   • dono.petrival@teste.local → dono do Pet Rival (teste)
-- =====================================================================
begin;

insert into public.harpia_equipe (user_id, nome, papel)
select id, 'Mauricio', 'super_admin' from auth.users where email = 'mauricio@angeluti.com.br'
on conflict (user_id) do update set papel = 'super_admin', ativo = true;

insert into public.petshop_membros (petshop_id, user_id, nome, papel)
select '11111111-1111-4111-8111-111111111111', id, 'Dono Pet Feliz', 'dono'
  from auth.users where email = 'dono.petfeliz@teste.local'
on conflict (petshop_id, user_id) do nothing;

insert into public.petshop_membros (petshop_id, user_id, nome, papel)
select '22222222-2222-4222-8222-222222222222', id, 'Dono Pet Rival', 'dono'
  from auth.users where email = 'dono.petrival@teste.local'
on conflict (petshop_id, user_id) do nothing;

-- Conferência: devem aparecer 3 linhas
select 'harpia' as onde, u.email, h.papel from public.harpia_equipe h join auth.users u on u.id = h.user_id
union all
select ps.nome, u.email, m.papel from public.petshop_membros m
  join auth.users u on u.id = m.user_id join public.petshops ps on ps.id = m.petshop_id;

commit;
