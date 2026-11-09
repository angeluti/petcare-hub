-- =====================================================================
-- PetCare Hub · Teste de aceite do painel (lado do banco)
-- Roda no SQL Editor do Supabase. Simula os dois donos de teste com o
-- mesmo papel e JWT que o painel usa (authenticated + auth.uid()) e
-- chama as MESMAS funções do painel. Tudo é desfeito no final.
-- Pré-requisito: arquivos 08 (seed) e 09 (usuários) aplicados.
-- Resultado esperado: linhas "OK A1…A4" e "ACEITE OK ✅".
-- =====================================================================

create or replace function private.aceite_painel() returns setof text
language plpgsql volatile as $fn$
declare
  tz    constant text := 'America/Sao_Paulo';
  pf    constant uuid := '11111111-1111-4111-8111-111111111111';
  pr    constant uuid := '22222222-2222-4222-8222-222222222222';
  s_bt  constant uuid := 'b0000000-0000-4000-8000-000000000003';  -- Banho e tosa (Pet Feliz)
  s_rb  constant uuid := 'b0000000-0000-4000-8000-000000000011';  -- Banho (Pet Rival)
  u_pf uuid; u_pr uuid; v_tutor uuid; v_pet uuid; v_ini timestamptz; d date;
  n_meu int; n_alheio int; ok boolean;
  saida text[] := '{}';
begin
  perform set_config('plpgsql.check_asserts', 'on', true);
  select id into u_pf from auth.users where email = 'petfeliz@gmail.com';
  select id into u_pr from auth.users where email = 'pataamigapetshop@outlook.com';

  begin
    assert u_pf is not null and u_pr is not null, 'FALHOU A0: usuários de teste não encontrados (rode o arquivo 09)';

    -- Próximo dia útil (fora do feriado de teste)
    d := (now() at time zone tz)::date + 2;
    while extract(dow from d) in (0, 6) or exists (
      select 1 from public.bloqueios b where b.petshop_id in (pf, pr) and (b.inicio at time zone tz)::date = d) loop
      d := d + 1;
    end loop;

    -- ---------------------------------------------------------------- A1
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) filter (where petshop_id = pf), count(*) filter (where petshop_id <> pf)
      into n_meu, n_alheio from public.agendamentos;
    assert n_meu > 0 and n_alheio = 0, format('FALHOU A1: Pet Feliz vê %s seus e %s alheios', n_meu, n_alheio);
    assert (select count(*) from public.tutor_petshop where petshop_id <> pf) = 0, 'FALHOU A1: tutores alheios visíveis';
    assert (select count(*) from public.servicos where petshop_id <> pf) = 0, 'FALHOU A1: serviços alheios visíveis';
    assert (select count(*) from public.petshops) = 1, 'FALHOU A1: enxerga outro pet shop';
    assert (select count(*) from public.minhas_funcionalidades(pf)) > 0, 'FALHOU A1: menu vazio';
    ok := false;
    begin perform public.minhas_funcionalidades(pr);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU A1: Pet Feliz conseguiu ler o menu do Pet Rival';
    reset role;
    saida := saida || 'OK A1 dono do Pet Feliz vê só o Pet Feliz (agenda, tutores, serviços, menu)'::text;

    -- ---------------------------------------------------------------- A2
    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) filter (where petshop_id = pr), count(*) filter (where petshop_id <> pr)
      into n_meu, n_alheio from public.tutor_petshop;
    assert n_meu > 0 and n_alheio = 0, format('FALHOU A2: Pet Rival vê %s tutores seus e %s alheios', n_meu, n_alheio);
    assert (select count(*) from public.agendamentos where petshop_id <> pr) = 0, 'FALHOU A2: agenda alheia visível';
    assert (select count(*) from public.pets p where not exists (
              select 1 from public.pet_petshop pp where pp.pet_id = p.id and pp.petshop_id = pr)) = 0,
           'FALHOU A2: pet de outro pet shop visível';
    reset role;
    saida := saida || 'OK A2 dono do Pet Rival vê só o Pet Rival'::text;

    -- ---------------------------------------------------------------- A3
    -- Mesmo fluxo da tela: cadastrar_tutor → cadastrar_pet → horarios_disponiveis → reservar_agendamento x2
    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_tutor := public.cadastrar_tutor(pr, '(19) 98888-0001', 'Aceite Um');
    v_pet   := public.cadastrar_pet(pr, v_tutor, 'Pipoca', 'P');
    select h.inicio into v_ini from public.horarios_disponiveis(pr, array[s_rb], 'P', d, null, false) h order by h.inicio limit 1;
    assert v_ini is not null, 'FALHOU A3: motor não achou horário em ' || d;
    perform public.reservar_agendamento(pr, v_pet, v_tutor, array[s_rb], v_ini);
    ok := false;
    begin
      perform public.reservar_agendamento(pr, 'd0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003', array[s_rb], v_ini);
    exception when sqlstate '23P01' then ok := true;
    end;
    assert ok, 'FALHOU A3: segunda reserva no mesmo horário NÃO deu erro';
    reset role;
    saida := saida || ('OK A3 Pet Rival: 2ª reserva em ' || to_char(v_ini at time zone tz, 'DD/MM HH24:MI') || ' recusada com 23P01')::text;

    -- ---------------------------------------------------------------- A4
    -- Pet Feliz (modo múltiplo): Banho e tosa só a Ana faz; ela tem capacidade 2,
    -- mas entrada escalonada de 30 min. Dois pets no MESMO início → 2º recusado.
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_tutor := public.cadastrar_tutor(pf, '(19) 98888-0002', 'Aceite Dois');
    v_pet   := public.cadastrar_pet(pf, v_tutor, 'Fumaça', 'M');
    select h.inicio into v_ini from public.horarios_disponiveis(pf, array[s_bt], 'M', d, null, false) h order by h.inicio limit 1;
    perform public.reservar_agendamento(pf, v_pet, v_tutor, array[s_bt], v_ini);
    ok := false;
    begin
      perform public.reservar_agendamento(pf, 'd0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', array[s_bt], v_ini);
    exception when sqlstate '23P01' then ok := true;
    end;
    assert ok, 'FALHOU A4: Pet Feliz aceitou dois Banho e tosa no mesmo início';
    -- E não consegue agendar no Pet Rival
    ok := false;
    begin
      perform public.reservar_agendamento(pr, v_pet, v_tutor, array[s_rb], v_ini);
    exception when others then ok := true;
    end;
    assert ok, 'FALHOU A4: Pet Feliz gravou agendamento no Pet Rival';
    reset role;
    saida := saida || 'OK A4 Pet Feliz: conflito no mesmo início recusado; não grava no Pet Rival'::text;

    raise exception 'FIM_DO_ACEITE';
  exception
    when assert_failure then saida := saida || sqlerrm;
    when others then
      if sqlerrm = 'FIM_DO_ACEITE' then saida := saida || 'ACEITE OK ✅ (nada foi gravado)'::text;
      else saida := saida || ('ERRO inesperado: ' || sqlerrm || ' [' || sqlstate || ']'); end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return query select unnest(saida);
end $fn$;

revoke all on function private.aceite_painel() from public, anon, authenticated;

select * from private.aceite_painel() as resultado;
-- Para remover depois da POC: drop function private.aceite_painel();
