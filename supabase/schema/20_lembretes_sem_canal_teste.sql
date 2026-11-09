-- =====================================================================
-- PetCare Hub · 20 · Cron de lembretes ignora o canal de teste
-- O workflow 02 chama lembretes_pendentes(null) e
-- bot_agendamentos_em_bloqueio(null) para todos os pet shops. Pet shop no
-- canal 'teste' (chat do N8n) não tem instância de WhatsApp: o envio falhava
-- e o lembrete ficava como falha em mensagens_log.
-- Agora, sem pet shop informado (cron), o canal 'teste' fica de fora.
-- Com pet shop informado (#lembrete no chat de teste), nada muda.
-- Mesma assinatura e mesmos filtros do 13. Rode depois do 19. Idempotente.
-- =====================================================================
begin;

create or replace function public.lembretes_pendentes(p_petshop uuid default null) returns table (
  agendamento_id uuid, petshop_id uuid, telefone text, nome_tutor text, pet text,
  data text, hora text, servicos text, nome_bot text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.petshop_id, t.telefone, tp.nome, p.nome,
         to_char(a.inicio at time zone ps.fuso, 'DD/MM'), to_char(a.inicio at time zone ps.fuso, 'HH24:MI'),
         (select string_agg(i.descricao, ' + ') from public.agendamento_itens i where i.agendamento_id = a.id),
         bc.nome_bot
    from public.agendamentos a
    join public.petshops ps      on ps.id = a.petshop_id and ps.ativo
    join public.bot_config bc    on bc.petshop_id = a.petshop_id and bc.ativo
    join public.tutores t        on t.id = a.tutor_id
    join public.tutor_petshop tp on tp.tutor_id = a.tutor_id and tp.petshop_id = a.petshop_id
    join public.pets p           on p.id = a.pet_id
   where a.status = 'confirmado'
     and (a.inicio at time zone ps.fuso)::date = (now() at time zone ps.fuso)::date + 1
     and tp.aceita_mensagens
     and (p_petshop is null or a.petshop_id = p_petshop)
     and (p_petshop is not null or bc.canal <> 'teste')
     and not exists (select 1 from public.lembretes l where l.agendamento_id = a.id and l.tipo = '24h')
     and not exists (select 1 from public.bloqueios b
                      where b.petshop_id = a.petshop_id
                        and (b.recurso_id is null or b.recurso_id = a.recurso_id)
                        and tstzrange(b.inicio, b.fim, '[)') && tstzrange(a.inicio, a.fim, '[)'))
     and (select count(*) from public.mensagens_log m
           where m.petshop_id = a.petshop_id and m.telefone = t.telefone and m.direcao = 'saida'
             and m.tipo in ('lembrete','reativacao','pet_pronto') and m.status <> 'falha'
             and m.criado_em > now() - interval '7 days') < bc.limite_msgs_auto_semana
   order by a.petshop_id, a.inicio;
$$;

create or replace function public.bot_agendamentos_em_bloqueio(p_petshop uuid default null) returns table (
  petshop_id uuid, telefone_avisos text, itens jsonb)
language sql stable security definer set search_path = '' as $$
  select a.petshop_id, bc.telefone_avisos,
         jsonb_agg(jsonb_build_object(
           'hora', to_char(a.inicio at time zone ps.fuso, 'HH24:MI'),
           'data', to_char(a.inicio at time zone ps.fuso, 'DD/MM'),
           'pet', p.nome, 'tutor', tp.nome, 'telefone', t.telefone) order by a.inicio)
    from public.agendamentos a
    join public.petshops ps      on ps.id = a.petshop_id and ps.ativo
    join public.bot_config bc    on bc.petshop_id = a.petshop_id and bc.ativo
    join public.tutores t        on t.id = a.tutor_id
    join public.tutor_petshop tp on tp.tutor_id = a.tutor_id and tp.petshop_id = a.petshop_id
    join public.pets p           on p.id = a.pet_id
   where a.status in ('pendente','confirmado')
     and (a.inicio at time zone ps.fuso)::date = (now() at time zone ps.fuso)::date + 1
     and (p_petshop is null or a.petshop_id = p_petshop)
     and (p_petshop is not null or bc.canal <> 'teste')
     and exists (select 1 from public.bloqueios b
                  where b.petshop_id = a.petshop_id
                    and (b.recurso_id is null or b.recurso_id = a.recurso_id)
                    and tstzrange(b.inicio, b.fim, '[)') && tstzrange(a.inicio, a.fim, '[)'))
   group by a.petshop_id, bc.telefone_avisos;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.lembretes_pendentes(uuid)', 'public.bot_agendamentos_em_bloqueio(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;

select 'Arquivo 20 aplicado: cron de lembretes ignora o canal de teste.' as resultado;
