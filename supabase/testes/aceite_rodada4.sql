-- =====================================================================
-- PetCare Hub · Teste de aceite da rodada 4 do painel (lado do banco)
-- CF-01 dados do pet shop · CF-03/AG-07 feriados e bloqueios · AC-02 vínculo do convite
-- Roda no SQL Editor depois do arquivo 12. Simula os donos de teste com o
-- mesmo papel e JWT que o painel usa. Tudo é desfeito no final.
-- Resultado esperado: "OK A5…A7" e "ACEITE RODADA 4 OK ✅".
-- =====================================================================

create or replace function private.aceite_rodada4() returns setof text
language plpgsql volatile as $fn$
declare
  tz     constant text := 'America/Sao_Paulo';
  pf     constant uuid := '11111111-1111-4111-8111-111111111111';
  pr     constant uuid := '22222222-2222-4222-8222-222222222222';
  ana    uuid;
  bruno  uuid;
  s_banho constant uuid := 'b0000000-0000-4000-8000-000000000001';  -- Banho (Pet Feliz)
  s_bt    constant uuid := 'b0000000-0000-4000-8000-000000000003';  -- Banho e tosa (só a Ana)
  u_pf uuid; u_pr uuid; u_novo uuid;
  d1 date; d2 date; n int; ok boolean; v_ag uuid; v_ini timestamptz;
  saida text[] := '{}';
begin
  perform set_config('plpgsql.check_asserts', 'on', true);
  select id into u_pf from auth.users where email = 'petfeliz@gmail.com';
  select id into u_pr from auth.users where email = 'pataamigapetshop@outlook.com';
  select id into ana   from public.recursos where petshop_id = pf and nome = 'Ana';
  select id into bruno from public.recursos where petshop_id = pf and nome = 'Bruno';

  begin
    assert u_pf is not null and u_pr is not null, 'FALHOU A0: usuários de teste não encontrados (arquivo 09)';
    assert ana is not null and bruno is not null, 'FALHOU A0: profissionais Ana/Bruno não encontrados (arquivo 08)';

    -- Dois dias úteis livres de bloqueio, a partir de daqui a 3 dias
    d1 := (now() at time zone tz)::date + 3;
    while extract(dow from d1) in (0, 6) or exists (
      select 1 from public.bloqueios b where b.petshop_id = pf and (b.inicio at time zone tz)::date = d1) loop
      d1 := d1 + 1;
    end loop;
    d2 := d1 + 1;
    while extract(dow from d2) in (0, 6) or exists (
      select 1 from public.bloqueios b where b.petshop_id = pf and (b.inicio at time zone tz)::date = d2) loop
      d2 := d2 + 1;
    end loop;

    -- ============================================================ A5 CF-01
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;

    update public.petshops
       set nome = 'Pet Feliz (ACEITE)', endereco = 'Rua dos Testes, 10 - Valinhos/SP',
           telefone_contato = '+551938881234', logo_url = 'https://exemplo/logo.png'
     where id = pf;
    assert (select telefone_contato from public.petshops where id = pf) = '+551938881234',
           'FALHOU A5: dono não conseguiu editar os dados do pet shop';

    ok := false; begin update public.petshops set plano_codigo = (select codigo from public.planos where codigo <> (select plano_codigo from public.petshops where id = pf) limit 1) where id = pf;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU A5: dono alterou o plano';
    ok := false; begin update public.petshops set slug = 'outro-slug' where id = pf;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU A5: dono alterou o slug';
    ok := false; begin update public.petshops set telefone_wp = '+5519900000000' where id = pf;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU A5: dono alterou o número do WhatsApp';
    ok := false; begin update public.petshops set ativo = false where id = pf;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU A5: dono alterou o status';

    update public.petshops set nome = 'Invadido' where id = pr;
    get diagnostics n = row_count;
    assert n = 0, 'FALHOU A5: dono do Pet Feliz alterou o Pet Rival';

    insert into storage.objects (bucket_id, name) values ('logos', pf::text || '/logo-aceite.png');
    ok := false; begin insert into storage.objects (bucket_id, name) values ('logos', pr::text || '/logo-invasao.png');
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU A5: dono do Pet Feliz gravou logo na pasta do Pet Rival';
    reset role;
    saida := saida || 'OK A5 CF-01: dono edita nome, endereço, telefone e logo; plano, slug, WhatsApp e status recusados; não mexe no Pet Rival'::text;

    -- ============================================================ A6 CF-03 / AG-07
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d1, null, false);
    assert n > 0, 'FALHOU A6: sem horários em ' || d1 || ' antes do feriado (ajuste o seed)';

    -- Feriado: pet shop inteiro, dia d1 (00:00 até 00:00 do dia seguinte, no fuso)
    insert into public.bloqueios (petshop_id, recurso_id, tipo, inicio, fim, motivo)
    values (pf, null, 'feriado', d1::timestamp at time zone tz, (d1 + 1)::timestamp at time zone tz, 'Feriado do aceite');
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d1, null, false);
    assert n = 0, format('FALHOU A6: %s horários oferecidos no feriado', n);
    assert not exists (select 1 from public.proximos_dias_com_vaga(pf, array[s_banho], 'M', 14) where dia = d1),
           'FALHOU A6: proximos_dias_com_vaga ainda lista o feriado';

    -- Agendamento da Ana às 09:00 em d2, ANTES da folga (para testar o aviso de conflito)
    select h.inicio into v_ini from public.horarios_disponiveis(pf, array[s_bt], 'M', d2, ana, false) h
     where (h.inicio at time zone tz)::time = '09:00';
    assert v_ini is not null, 'FALHOU A6: Ana sem horário às 09:00 em ' || d2;
    select (public.reservar_agendamento(pf, 'd0000000-0000-4000-8000-000000000003',
                                        'c0000000-0000-4000-8000-000000000002', array[s_bt], v_ini, ana)).id into v_ag;

    -- Folga da Ana em d2 das 08:00 às 12:00
    insert into public.bloqueios (petshop_id, recurso_id, tipo, inicio, fim, motivo)
    values (pf, ana, 'folga', (d2 + time '08:00') at time zone tz, (d2 + time '12:00') at time zone tz, 'Folga do aceite');

    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d2, ana, false) h
     where h.inicio < (d2 + time '12:00') at time zone tz;
    assert n = 0, format('FALHOU A6: Ana com %s horários na folga', n);
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d2, bruno, false) h
     where h.inicio < (d2 + time '12:00') at time zone tz;
    assert n > 0, 'FALHOU A6: a folga da Ana tirou os horários do Bruno';
    select count(*) into n from public.horarios_disponiveis(pf, array[s_bt], 'M', d2, null, false) h
     where h.inicio < (d2 + time '12:00') at time zone tz;
    assert n = 0, 'FALHOU A6: Banho e tosa (só a Ana) oferecido na folga';

    -- Aviso ao dono: a mesma consulta que o painel faz antes de salvar o bloqueio
    select count(*) into n from public.agendamentos a
     where a.petshop_id = pf and a.recurso_id = ana
       and a.status not in ('cancelado','no_show','entregue')
       and a.inicio < (d2 + time '12:00') at time zone tz
       and a.fim    > (d2 + time '08:00') at time zone tz;
    assert n = 1, format('FALHOU A6: esperado 1 agendamento em conflito com a folga, achou %s', n);
    reset role;

    -- Pet Rival não vê nem cria bloqueio do Pet Feliz
    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select count(*) from public.bloqueios where petshop_id = pf) = 0, 'FALHOU A6: Pet Rival vê bloqueios do Pet Feliz';
    ok := false;
    begin
      insert into public.bloqueios (petshop_id, tipo, inicio, fim) values (pf, 'outro', now(), now() + interval '1 hour');
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU A6: Pet Rival criou bloqueio no Pet Feliz';
    reset role;
    saida := saida || ('OK A6 CF-03/AG-07: feriado em ' || to_char(d1, 'DD/MM') || ' e folga da Ana em ' || to_char(d2, 'DD/MM')
                       || ' somem do motor; Bruno segue livre; agendamento em conflito detectado; Pet Rival isolado')::text;

    -- ============================================================ A7 AC-02
    -- Dono (authenticated) não executa a função de vínculo
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.admin_vincular_membro('qualquer@teste.local', pf, 'dono');
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU A7: authenticated executou admin_vincular_membro';
    reset role;

    -- O que a Edge Function faz: inviteUserByEmail cria o usuário; a função vincula
    insert into auth.users (id, email) values (gen_random_uuid(), 'convidado.aceite@teste.local') returning id into u_novo;
    set local role service_role;
    assert public.admin_vincular_membro('Convidado.Aceite@teste.local', pf, 'dono', 'Convidado') = u_novo,
           'FALHOU A7: vínculo não devolveu o usuário convidado';
    -- repetir não duplica (reconvite)
    perform public.admin_vincular_membro('convidado.aceite@teste.local', pf, 'dono');
    reset role;
    assert (select count(*) from public.petshop_membros where user_id = u_novo) = 1, 'FALHOU A7: vínculo duplicado';

    -- O convidado entra e vê só o pet shop vinculado
    perform set_config('request.jwt.claims', json_build_object('sub', u_novo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select count(*) from public.petshops) = 1 and (select id from public.petshops) = pf,
           'FALHOU A7: convidado vê outro pet shop';
    assert (select count(*) from public.minhas_funcionalidades(pf)) > 0, 'FALHOU A7: convidado sem menu';
    ok := false;
    begin perform public.minhas_funcionalidades(pr);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU A7: convidado leu o menu do Pet Rival';
    reset role;
    saida := saida || 'OK A7 AC-02: só o servidor vincula; reconvite não duplica; convidado vê só o pet shop dele'::text;

    raise exception 'FIM_DO_ACEITE';
  exception
    when assert_failure then saida := saida || sqlerrm;
    when others then
      if sqlerrm = 'FIM_DO_ACEITE' then saida := saida || 'ACEITE RODADA 4 OK ✅ (nada foi gravado)'::text;
      else saida := saida || ('ERRO inesperado: ' || sqlerrm || ' [' || sqlstate || ']'); end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return query select unnest(saida);
end $fn$;

revoke all on function private.aceite_rodada4() from public, anon, authenticated;

select * from private.aceite_rodada4() as resultado;
-- Para remover depois da POC: drop function private.aceite_rodada4();
