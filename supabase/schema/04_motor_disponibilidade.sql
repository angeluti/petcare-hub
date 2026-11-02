-- =====================================================================
-- PetCare Hub · 04 · Motor de disponibilidade (AG-01, AG-15)
-- Uma regra só para bot e painel. O N8n não decide horário: pergunta ao banco.
--
-- Como calcula, para um dia:
--   1. duração = soma das durações dos serviços para o porte do pet
--   2. recursos aptos = ativos, do tipo exigido, que fazem TODOS os serviços
--   3. janelas = escala do recurso (ou, se não tiver, horário do pet shop)
--   4. candidatos = início a cada intervalo_slot_min dentro da janela
--   5. descarta: antes da antecedência mínima, depois da máxima, bloqueios,
--      carga >= capacidade, e entrada escalonada muito próxima
--   6. devolve vagas = capacidade - carga (para o bot ordenar/escolher)
-- Datas e horas sempre no fuso do pet shop (o Supabase roda em UTC).
-- =====================================================================
begin;

create or replace function public.horarios_disponiveis(
  p_petshop                uuid,
  p_servicos               uuid[],
  p_porte                  text,
  p_data                   date,
  p_recurso                uuid    default null,
  p_aplicar_antecedencia   boolean default true)
returns table (inicio timestamptz, fim timestamptz, recurso_id uuid, recurso_nome text, vagas int)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_shop     public.petshops;
  v_dur      int;
  v_tipo     text;
  v_dow      int := extract(dow from p_data)::int;
  v_min      timestamptz;
  v_max      timestamptz;
begin
  select * into v_shop from public.petshops where id = p_petshop and ativo;
  if v_shop.id is null then return; end if;   -- RLS esconde pet shop alheio → lista vazia

  if p_porte not in ('P','M','G','GG') then raise exception 'Porte inválido: %', p_porte using errcode = '22023'; end if;
  if coalesce(cardinality(p_servicos), 0) = 0 then raise exception 'Informe ao menos um serviço' using errcode = '22023'; end if;

  if exists (select 1 from unnest(p_servicos) u(sid)
              where not exists (select 1 from public.servicos s
                                  join public.servico_precos sp on sp.servico_id = s.id and sp.porte = p_porte
                                 where s.id = u.sid and s.petshop_id = p_petshop and s.ativo)) then
    raise exception 'Serviço inativo, de outro pet shop ou sem preço/duração para o porte %', p_porte using errcode = '22023';
  end if;

  select sum(sp.duracao_min) into v_dur
    from unnest(p_servicos) u(sid)
    join public.servico_precos sp on sp.servico_id = u.sid and sp.porte = p_porte;

  select min(s.recurso_tipo) into v_tipo
    from public.servicos s where s.id = any (p_servicos);
  if (select count(distinct s.recurso_tipo) from public.servicos s where s.id = any (p_servicos)) > 1 then
    raise exception 'Serviços exigem tipos de recurso diferentes; agende separadamente' using errcode = '22023';
  end if;

  v_min := now() + case when p_aplicar_antecedencia
                        then make_interval(mins => v_shop.antecedencia_min_minutos)
                        else interval '0' end;
  v_max := case when p_aplicar_antecedencia
                then now() + make_interval(days => v_shop.antecedencia_max_dias)
                else 'infinity'::timestamptz end;

  return query
  with recursos_aptos as (
    select r.id, r.nome,
           case when v_shop.modo_capacidade = 'multiplo' then r.capacidade else 1 end            as cap,
           case when v_shop.modo_capacidade = 'multiplo' then r.intervalo_entrada_min else 0 end as interv
      from public.recursos r
     where r.petshop_id = p_petshop and r.ativo and r.tipo = v_tipo
       and (p_recurso is null or r.id = p_recurso)
       and (   not exists (select 1 from public.recurso_servicos rs where rs.recurso_id = r.id)
            or (select count(*) from public.recurso_servicos rs
                 where rs.recurso_id = r.id and rs.servico_id = any (p_servicos)) = cardinality(p_servicos))
  ),
  janelas as (
    select ra.id as rid,
           ((p_data + j.ini) at time zone v_shop.fuso) as jini,
           ((p_data + j.fim) at time zone v_shop.fuso) as jfim
      from recursos_aptos ra
      cross join lateral (
        select rh.inicio as ini, rh.fim as fim
          from public.recurso_horarios rh
         where rh.recurso_id = ra.id and rh.dia_semana = v_dow
        union all
        select hf.abre, hf.fecha
          from public.horarios_funcionamento hf
         where hf.petshop_id = p_petshop and hf.dia_semana = v_dow
           and not exists (select 1 from public.recurso_horarios rh2 where rh2.recurso_id = ra.id)
      ) j
  ),
  candidatos as (
    select j.rid, g.t as c_ini, g.t + make_interval(mins => v_dur) as c_fim
      from janelas j
      cross join lateral generate_series(j.jini, j.jfim - make_interval(mins => v_dur),
                                         make_interval(mins => v_shop.intervalo_slot_min)) g(t)
  )
  select c.c_ini, c.c_fim, ra.id, ra.nome, (ra.cap - cg.carga)::int
    from candidatos c
    join recursos_aptos ra on ra.id = c.rid
    cross join lateral (select private.carga_maxima(ra.id, c.c_ini, c.c_fim) as carga) cg
   where c.c_ini >= v_min
     and c.c_ini <= v_max
     and cg.carga < ra.cap
     and not exists (
           select 1 from public.bloqueios b
            where b.petshop_id = p_petshop
              and (b.recurso_id is null or b.recurso_id = ra.id)
              and tstzrange(b.inicio, b.fim, '[)') && tstzrange(c.c_ini, c.c_fim, '[)'))
     and (ra.interv = 0 or not exists (
           select 1 from public.agendamentos a
            where a.recurso_id = ra.id
              and a.status not in ('cancelado','no_show')
              and abs(extract(epoch from (a.inicio - c.c_ini))) < ra.interv * 60))
   order by c.c_ini, ra.nome;
end $$;

-- Para o bot: um horário por linha, somando vagas de todos os profissionais.
create or replace function public.horarios_livres_resumo(
  p_petshop uuid, p_servicos uuid[], p_porte text, p_data date)
returns table (inicio timestamptz, hora text, vagas bigint)
language sql stable security invoker set search_path = '' as $$
  select h.inicio, to_char(h.inicio at time zone p.fuso, 'HH24:MI'), sum(h.vagas)
    from public.horarios_disponiveis(p_petshop, p_servicos, p_porte, p_data) h
    join public.petshops p on p.id = p_petshop
   group by h.inicio, p.fuso
   order by h.inicio;
$$;

-- Para o bot no estado aguardando_data: próximos dias com vaga.
create or replace function public.proximos_dias_com_vaga(
  p_petshop uuid, p_servicos uuid[], p_porte text, p_dias int default 7)
returns table (dia date, dia_semana text, horarios bigint)
language sql stable security invoker set search_path = '' as $$
  with hoje as (select (now() at time zone p.fuso)::date as d from public.petshops p where p.id = p_petshop)
  select g.d::date,
         (array['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow from g.d)::int + 1],
         count(distinct h.inicio)
    from hoje
    cross join lateral generate_series(hoje.d, hoje.d + (least(p_dias, 60) - 1), interval '1 day') g(d)
    cross join lateral public.horarios_disponiveis(p_petshop, p_servicos, p_porte, g.d::date) h
   group by g.d
   order by g.d;
$$;

-- ---------------------------------------------------------------------
-- Reserva: usa o motor (ou encaixe), cria agendamento + itens numa transação.
-- O trigger de capacidade ainda revalida com lock: se dois tutores pegarem o
-- mesmo horário ao mesmo tempo, o segundo recebe erro 23P01 (HTTP 409).
-- ---------------------------------------------------------------------
create or replace function public.reservar_agendamento(
  p_petshop      uuid,
  p_pet          uuid,
  p_tutor        uuid,
  p_servicos     uuid[],
  p_inicio       timestamptz,
  p_recurso      uuid    default null,
  p_origem       text    default 'manual',
  p_observacoes  text    default null,
  p_encaixe      boolean default false,
  p_status       text    default 'confirmado')
returns public.agendamentos
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_porte  text;
  v_dur    int;
  v_rec    uuid;
  v_fuso   text;
  v_ag     public.agendamentos;
begin
  if p_encaixe and p_origem <> 'manual' then
    raise exception 'Encaixe só pelo painel' using errcode = '22023';
  end if;

  select pt.porte into v_porte from public.pets pt where pt.id = p_pet;
  if v_porte is null then raise exception 'Pet sem porte cadastrado' using errcode = '22023'; end if;
  select p.fuso into v_fuso from public.petshops p where p.id = p_petshop;

  select sum(sp.duracao_min) into v_dur
    from unnest(p_servicos) u(sid)
    join public.servico_precos sp on sp.servico_id = u.sid and sp.porte = v_porte;
  if v_dur is null then raise exception 'Serviço sem duração para o porte %', v_porte using errcode = '22023'; end if;

  if p_encaixe then
    if p_recurso is null then raise exception 'Encaixe exige escolher o profissional' using errcode = '22023'; end if;
    v_rec := p_recurso;
  else
    select h.recurso_id into v_rec
      from public.horarios_disponiveis(p_petshop, p_servicos, v_porte,
                                       (p_inicio at time zone v_fuso)::date, p_recurso,
                                       p_origem <> 'manual') h
     where h.inicio = p_inicio
     order by h.vagas desc, h.recurso_nome
     limit 1;
    if v_rec is null then
      raise exception 'Horário indisponível para este serviço e porte' using errcode = '23P01';
    end if;
  end if;

  insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim,
                                   status, origem, encaixe, observacoes, criado_por)
  values (p_petshop, p_pet, p_tutor, v_rec, p_inicio, p_inicio + make_interval(mins => v_dur),
          p_status, p_origem, p_encaixe, p_observacoes, auth.uid())
  returning * into v_ag;

  insert into public.agendamento_itens (agendamento_id, petshop_id, tipo, servico_id, descricao, preco_unitario, duracao_min)
  select v_ag.id, p_petshop, case when s.adicional then 'adicional' else 'servico' end,
         s.id, s.nome, sp.preco, sp.duracao_min
    from unnest(p_servicos) with ordinality u(sid, ord)
    join public.servicos s        on s.id = u.sid
    join public.servico_precos sp on sp.servico_id = s.id and sp.porte = v_porte
   order by u.ord;

  select * into v_ag from public.agendamentos where id = v_ag.id;   -- com valor_total atualizado
  return v_ag;
end $$;

commit;
