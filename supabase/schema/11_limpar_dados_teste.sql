-- =====================================================================
-- PetCare Hub · 11 · Limpar os dados de teste (antes da POC real)
-- Mantém o catálogo (planos, módulos, funcionalidades) e seu super admin.
-- Depois, apague os usuários *@teste.local em Authentication → Users.
-- =====================================================================
begin;
-- Agenda primeiro (itens apontam para serviços sem cascata, de propósito).
delete from public.agendamentos
 where petshop_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
-- Cascata leva vínculos, eventos, bot, custos e contrato.
delete from public.petshops
 where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
-- Identidade global dos tutores/pets fictícios
delete from public.plaquinhas where codigo = 'THOR2026AB';
delete from public.pets    where tutor_id in ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000003');
delete from public.tutores where id       in ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000003');
select (select count(*) from public.petshops) as petshops, (select count(*) from public.tutores) as tutores,
       (select count(*) from public.pets) as pets, (select count(*) from public.planos) as planos;
commit;
