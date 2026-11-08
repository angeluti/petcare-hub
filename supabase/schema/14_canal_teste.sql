-- =====================================================================
-- PetCare Hub · 14 · Canal de teste do bot
-- Permite conversar com o bot pelo chat do N8n, sem provedor de WhatsApp.
-- O mesmo motor, as mesmas funções e as mesmas regras; só o transporte muda.
--   1. 'teste' como canal aceito em bot_config e mensagens_log
--   2. bot_petshop_teste(slug): só pet shop com bot_config.canal = 'teste'
--      (o canal de teste nunca escreve num pet shop real por engano)
-- Quando o provedor for escolhido, um arquivo novo acrescenta o canal dele.
-- Rode depois do 13. Pode rodar de novo.
-- =====================================================================
begin;

alter table public.bot_config drop constraint if exists bot_config_canal_check;
alter table public.bot_config add constraint bot_config_canal_check
  check (canal in ('zapi','meta_oficial','teste'));

alter table public.mensagens_log drop constraint if exists mensagens_log_canal_check;
alter table public.mensagens_log add constraint mensagens_log_canal_check
  check (canal in ('zapi','meta_oficial','teste'));

create or replace function public.bot_petshop_teste(p_slug text) returns uuid
language sql stable security definer set search_path = '' as $$
  select bc.petshop_id
    from public.bot_config bc
    join public.petshops ps on ps.id = bc.petshop_id and ps.ativo
   where ps.slug = p_slug and bc.canal = 'teste';
$$;

revoke execute on function public.bot_petshop_teste(text) from public, anon, authenticated;
grant execute on function public.bot_petshop_teste(text) to service_role;

commit;

select 'Arquivo 14 aplicado: canal de teste.' as resultado;
