-- =====================================================================
-- PetCare Hub · 00 · Remove o schema anterior à reestruturação
-- Por quê: o projeto não tem dados reais. Transformar tutores/pets
-- "por pet shop" em identidade global + vínculo dá mais trabalho e mais
-- risco do que recriar. Nada de valor se perde.
--
-- TRAVA DE SEGURANÇA: só roda se você descomentar a linha abaixo.
-- A trava e os DROPs estão no mesmo bloco: sem a linha, nada é apagado.
-- =====================================================================

-- select set_config('petcare.confirmo_reset', 'sim', false);

do $$
declare r record;
begin
  for r in
    select 1 o, format('drop view if exists public.%I cascade', viewname) s from pg_views where schemaname = 'public'
    union all
    select 2, format('drop materialized view if exists public.%I cascade', matviewname) from pg_matviews where schemaname = 'public'
    union all
    select 3, format('drop table if exists public.%I cascade', tablename) from pg_tables where schemaname = 'public'
    union all
    select 4, format('drop routine if exists public.%I(%s) cascade', p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    union all
    select 5, format('drop type if exists public.%I cascade', t.typname)
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typtype in ('e','d')
       and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
    order by 1
  loop
    raise notice '%', r.s;
    execute r.s;
  end loop;
end $$;
drop schema if exists private cascade;

select 'Schema antigo removido.' as resultado;
