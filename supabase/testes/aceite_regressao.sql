-- =====================================================================
-- PetCare Hub · Aceite de regressão (banco de teste já usado)
-- O arquivo 10 supõe o banco recém-semeado: a agenda do seed num dia útil
-- futuro, o Bob só no Pata Amiga, 2 tutores e 3 pets no Pet Feliz. Depois de
-- semanas de testes no painel e no bot, isso não vale mais, e os grupos T01,
-- T02, T05 e T07 falham sem haver defeito. Este arquivo repete as mesmas
-- verificações sem depender desse estado:
--   • monta a própria agenda (as 3 reservas do seed) num dia útil livre, a
--     pelo menos 14 dias, e um feriado uma semana depois;
--   • usa pets e tutores criados aqui para "não vinculado" e "tutor de outro
--     pet shop";
--   • compara as contagens da RLS com o que está vinculado de fato;
--   • calcula preços esperados a partir de servico_precos.
-- O arquivo 10 não muda e continua valendo para um banco recém-semeado.
--
-- Rode no SQL Editor depois do 21. Tudo é desfeito no final (nada é gravado).
-- Resultado esperado na última linha: "REGRESSÃO OK".
-- Para repetir: select * from private.aceite_regressao();
-- =====================================================================

create or replace function private.aceite_regressao() returns setof text
language plpgsql volatile as $fn$
declare
  tz      constant text := 'America/Sao_Paulo';
  pf      constant uuid := '11111111-1111-4111-8111-111111111111';   -- Pet Feliz
  pr      constant uuid := '22222222-2222-4222-8222-222222222222';   -- Pata Amiga Petshop
  ana     constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  bru     constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  s_banho constant uuid := 'b0000000-0000-4000-8000-000000000001';
  s_bt    constant uuid := 'b0000000-0000-4000-8000-000000000003';
  s_hid   constant uuid := 'b0000000-0000-4000-8000-000000000004';
  t_carla constant uuid := 'c0000000-0000-4000-8000-000000000001';
  t_diego constant uuid := 'c0000000-0000-4000-8000-000000000002';
  t_elisa constant uuid := 'c0000000-0000-4000-8000-000000000003';
  p_thor  constant uuid := 'd0000000-0000-4000-8000-000000000001';
  p_mel   constant uuid := 'd0000000-0000-4000-8000-000000000002';
  p_nina  constant uuid := 'd0000000-0000-4000-8000-000000000003';
  p_bob   constant uuid := 'd0000000-0000-4000-8000-000000000004';
  tel_r07 constant text := '+5519900070707';   -- tutor criado no R07 (não pode existir no banco)
  d date; f date; u_pf uuid; u_pr uuid;
  saida text[] := '{}';
  falhas text[] := '{}';
  n int; ok boolean; v_ag uuid; v_tutor uuid; r jsonb;
  n_tut int; n_pets int; v_pet_pr uuid; t_r07 uuid; p_r07 uuid;
  v_porte_thor text; v_porte_nina text; v_total numeric; v_preco numeric; v_dur int;
  a public.agendamentos;
begin
  perform set_config('plpgsql.check_asserts', 'on', true);
  select id into u_pf from auth.users where email = 'petfeliz@gmail.com';
  select id into u_pr from auth.users where email = 'pataamigapetshop@outlook.com';

  begin
    -- ------------------------------------------------------------ R00 PRÉ-CONDIÇÕES
    assert u_pf is not null and u_pr is not null,
           'FALHOU R00a: usuários petfeliz@gmail.com e pataamigapetshop@outlook.com não encontrados';
    assert (select count(*) from public.pets x where x.id in (p_thor, p_mel, p_nina, p_bob)) = 4,
           'FALHOU R00b: pets do seed (Thor, Mel, Nina, Bob) não encontrados. O 11 já foi rodado?';
    assert not exists (select 1 from public.tutores where telefone = tel_r07),
           'FALHOU R00c: o telefone de teste ' || tel_r07 || ' já existe no banco';

    -- A agenda do teste usa a configuração do seed. Se o painel mudou algo, o
    -- teste para aqui e diz o quê, em vez de falhar adiante sem explicação.
    if not exists (select 1 from public.recursos where id = ana and capacidade = 2 and intervalo_entrada_min = 30) then
      falhas := falhas || 'Ana deveria ter capacidade 2 e 30 min entre entradas'::text;
    end if;
    if not exists (select 1 from public.recursos where id = bru and capacidade = 1) then
      falhas := falhas || 'Bruno deveria ter capacidade 1'::text;
    end if;
    if (select count(*) from public.recurso_servicos where recurso_id = bru) <> 2
       or exists (select 1 from public.recurso_servicos where recurso_id = bru and servico_id not in (s_banho, s_hid)) then
      falhas := falhas || 'Bruno deveria fazer só Banho e Hidratação'::text;
    end if;
    if exists (select 1 from public.recurso_servicos where recurso_id = ana) then
      falhas := falhas || 'Ana não deveria ter lista de serviços (faz todos)'::text;
    end if;
    if exists (select 1 from public.recurso_horarios where recurso_id in (ana, bru)) then
      falhas := falhas || 'Ana e Bruno não deveriam ter horário próprio (seguem o da loja)'::text;
    end if;
    if (select count(*) from public.horarios_funcionamento
         where petshop_id = pf and dia_semana between 1 and 5
           and ((abre = '08:00' and fecha = '12:00') or (abre = '13:00' and fecha = '18:00'))) <> 10
       or exists (select 1 from public.horarios_funcionamento where petshop_id = pf and dia_semana between 1 and 5
                   and not ((abre = '08:00' and fecha = '12:00') or (abre = '13:00' and fecha = '18:00'))) then
      falhas := falhas || 'Horário do Pet Feliz de segunda a sexta deveria ser 08–12 e 13–18'::text;
    end if;
    if not exists (select 1 from public.servico_precos where servico_id = s_banho and porte = 'P' and duracao_min = 45)
       or not exists (select 1 from public.servico_precos where servico_id = s_banho and porte = 'M' and duracao_min = 60)
       or not exists (select 1 from public.servico_precos where servico_id = s_bt and porte = 'G' and duracao_min = 120)
       or not exists (select 1 from public.servico_precos where servico_id = s_hid and porte = 'G' and duracao_min = 25) then
      falhas := falhas || 'Durações deveriam ser as do seed (Banho P 45 e M 60; Banho e tosa G 120; Hidratação G 25)'::text;
    end if;
    select porte into v_porte_thor from public.pets where id = p_thor;
    select porte into v_porte_nina from public.pets where id = p_nina;
    if v_porte_thor is distinct from 'G' or v_porte_nina is distinct from 'M'
       or (select porte from public.pets where id = p_mel) is distinct from 'P' then
      falhas := falhas || 'Portes deveriam ser Thor G, Mel P e Nina M'::text;
    end if;
    assert cardinality(falhas) = 0,
           'FALHOU R00d: a configuração de teste do Pet Feliz mudou: ' || array_to_string(falhas, '; ');

    -- Dia útil livre (sem agendamento e sem bloqueio no Pet Feliz), a partir de 14 dias.
    d := (now() at time zone tz)::date + 14;
    loop
      exit when extract(dow from d) not in (0, 6)
        and not exists (select 1 from public.agendamentos x
                         where x.petshop_id = pf and (x.inicio at time zone tz)::date = d)
        and not exists (select 1 from public.bloqueios b where b.petshop_id = pf
                         and tstzrange(b.inicio, b.fim, '[)')
                             && tstzrange((d::timestamp) at time zone tz, ((d + 1)::timestamp) at time zone tz, '[)'));
      d := d + 1;
      assert d < (now() at time zone tz)::date + 120, 'FALHOU R00e: nenhum dia útil livre nos próximos 120 dias';
    end loop;
    -- Feriado de teste uma semana depois (dia útil)
    f := d + 7;
    while extract(dow from f) in (0, 6) loop f := f + 1; end loop;
    insert into public.bloqueios (petshop_id, tipo, inicio, fim, motivo)
    values (pf, 'feriado', (f::timestamp) at time zone tz, ((f + 1)::timestamp) at time zone tz, 'Feriado de teste (regressão)');

    -- As 3 reservas do seed, no dia livre
    a := public.reservar_agendamento(pf, p_thor, t_carla, array[s_bt, s_hid], ((d + time '09:00') at time zone tz), ana, 'manual');
    v_ag := a.id;
    perform public.reservar_agendamento(pf, p_mel,  t_carla, array[s_banho], ((d + time '09:30') at time zone tz), ana, 'bot');
    perform public.reservar_agendamento(pf, p_nina, t_diego, array[s_banho], ((d + time '09:00') at time zone tz), bru, 'bot');

    -- Consentimentos da Elisa ativos (podem ter sido revogados em testes do bot)
    insert into public.consentimentos (tutor_id, escopo, versao_termo, canal, petshop_origem_id)
    select t_elisa, e, 'v0-teste', 'bot', pr
      from unnest(array['compartilhar_dados_pet', 'compartilhar_saude']) e
     where not private.tutor_consente(t_elisa, e);

    -- O que a RLS deve mostrar ao dono do Pet Feliz: o que está vinculado a ele
    select count(distinct tp.tutor_id) into n_tut from public.tutor_petshop tp where tp.petshop_id = pf;
    select count(distinct pp.pet_id) into n_pets from public.pet_petshop pp where pp.petshop_id = pf;

    saida := saida || ('OK R00 configuração de teste conferida; agenda montada em ' || to_char(d, 'DD/MM/YYYY')
                       || ', feriado em ' || to_char(f, 'DD/MM/YYYY'));

    -- ------------------------------------------------------------ R01 MOTOR
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d) h
     where (h.inicio at time zone tz)::time = '09:00';
    assert n = 0, 'FALHOU R01a: 09:00 deveria estar lotado, veio ' || n;
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d) h
     where (h.inicio at time zone tz)::time = '13:00';
    assert n = 2, 'FALHOU R01b: 13:00 deveria ter 2 profissionais, veio ' || n;
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d) h
     where (h.inicio at time zone tz)::time = '11:30';
    assert n = 0, 'FALHOU R01c: 11:30 atravessa o almoço';
    select count(distinct h.recurso_id) into n from public.horarios_disponiveis(pf, array[s_bt], 'M', d) h;
    assert n = 1, 'FALHOU R01d: banho e tosa deveria listar só a Ana, veio ' || n;
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', f);
    assert n = 0, 'FALHOU R01e: feriado deveria vir vazio, veio ' || n;
    assert exists (select 1 from public.horarios_livres_resumo(pf, array[s_banho], 'M', d) h where h.hora = '13:00' and h.vagas = 3),
           'FALHOU R01f: resumo das 13:00 deveria somar 3 vagas (Ana 2 + Bruno 1)';
    saida := saida || 'OK R01 motor de disponibilidade (lotação, almoço, quem faz o serviço, feriado, resumo)'::text;

    -- ------------------------------------------------------------ R02 CAPACIDADE
    ok := false;
    begin
      insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim)
      values (pf, p_nina, t_diego, ana, (d + time '10:00') at time zone tz, (d + time '10:30') at time zone tz);
    exception when sqlstate '23P01' then ok := true;
    end;
    assert ok, 'FALHOU R02a: 3º pet simultâneo na Ana deveria ser recusado';
    insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim)
    values (pf, p_nina, t_diego, ana, (d + time '10:30') at time zone tz, (d + time '11:00') at time zone tz);
    insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim)
    values (pf, p_mel, t_carla, ana, (d + time '13:00') at time zone tz, (d + time '14:00') at time zone tz);
    ok := false;
    begin
      insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim)
      values (pf, p_nina, t_diego, ana, (d + time '13:15') at time zone tz, (d + time '13:45') at time zone tz);
    exception when sqlstate '23P01' then ok := true;
    end;
    assert ok, 'FALHOU R02b: entrada escalonada deveria exigir 30 min';
    insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim, encaixe)
    values (pf, p_nina, t_diego, ana, (d + time '09:45') at time zone tz, (d + time '10:15') at time zone tz, true);
    -- Pet só do Pata Amiga, criado aqui (o Bob já pode estar vinculado ao Pet Feliz)
    insert into public.pets (tutor_id, nome, especie, porte, criado_por_petshop_id)
    values (t_elisa, 'Teste regressão R02', 'cao', 'M', pr) returning id into v_pet_pr;
    insert into public.pet_petshop (pet_id, petshop_id) values (v_pet_pr, pr);
    ok := false;
    begin
      insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim)
      values (pf, v_pet_pr, t_elisa, bru, (d + time '15:00') at time zone tz, (d + time '16:00') at time zone tz);
    exception when foreign_key_violation then ok := true;
    end;
    assert ok, 'FALHOU R02c: pet não vinculado não pode ser agendado';
    saida := saida || 'OK R02 capacidade exata, entrada escalonada, encaixe e FK composta'::text;

    -- ------------------------------------------------------------ R03 RESERVA PELO MOTOR
    select preco, duracao_min into v_preco, v_dur from public.servico_precos where servico_id = s_banho and porte = v_porte_nina;
    a := public.reservar_agendamento(pf, p_nina, t_diego, array[s_banho], (d + time '15:00') at time zone tz, null, 'bot');
    assert a.valor_total = v_preco and a.fim - a.inicio = make_interval(mins => v_dur),
           'FALHOU R03a: banho M deveria custar ' || v_preco || ' e durar ' || v_dur || ' min; veio '
           || a.valor_total || ' e ' || (a.fim - a.inicio);
    ok := false;
    begin
      perform public.reservar_agendamento(pf, p_nina, t_diego, array[s_banho], (d + time '12:15') at time zone tz, null, 'bot');
    exception when sqlstate '23P01' then ok := true;
    end;
    assert ok, 'FALHOU R03b: horário no almoço deveria ser recusado pelo motor';
    saida := saida || 'OK R03 reservar_agendamento (escolhe profissional, preço e duração por porte)'::text;

    -- ------------------------------------------------------------ R04 STATUS E CHECK-OUT
    ok := false;
    begin
      update public.agendamentos set status = 'pronto' where id = v_ag;
    exception when sqlstate '22023' then ok := true;
    end;
    assert ok, 'FALHOU R04a: transição inválida deveria ser barrada';
    select sum(preco) into v_total from public.servico_precos where servico_id in (s_bt, s_hid) and porte = v_porte_thor;

    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.fazer_checkin(v_ag);
    a := public.fazer_checkout(v_ag, jsonb_build_array(jsonb_build_object('forma', 'pix', 'valor', v_total)));
    assert a.status = 'entregue' and a.valor_total = v_total and a.pagamento_status = 'pago',
           'FALHOU R04b: checkout ' || a.status || ' ' || a.valor_total || ' (esperado ' || v_total || ') ' || a.pagamento_status;
    assert a.checkin_em is not null and a.checkout_em is not null, 'FALHOU R04c: carimbos de horário';
    assert (select count(*) from public.pet_eventos e where e.agendamento_id = v_ag and e.tipo = 'estetica' and e.visibilidade = 'privado') = 1,
           'FALHOU R04d: checkout deveria gravar 1 evento estético privado';
    saida := saida || 'OK R04 ciclo de status e check-out como evento único'::text;

    -- ------------------------------------------------------------ R05 RLS: dono do Pet Feliz
    assert (select count(*) from public.petshops) = 1, 'FALHOU R05a: dono vê só o próprio pet shop';
    assert not exists (select 1 from public.agendamentos x where x.petshop_id <> pf), 'FALHOU R05b: vazou agendamento de outro pet shop';
    n := (select count(*) from public.tutores);
    assert n = n_tut, 'FALHOU R05c: deveria ver os ' || n_tut || ' tutores vinculados ao Pet Feliz, viu ' || n;
    n := (select count(*) from public.pets);
    assert n = n_pets, 'FALHOU R05d: deveria ver os ' || n_pets || ' pets vinculados ao Pet Feliz, viu ' || n;
    assert not exists (select 1 from public.pets x where x.id = v_pet_pr), 'FALHOU R05e: pet só do Pata Amiga apareceu';
    assert not exists (select 1 from public.harpia_contratos), 'FALHOU R05f: contrato Harpia é só do super admin';
    ok := false;
    begin
      update public.petshops set plano_codigo = 'clinic' where id = pf;
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, 'FALHOU R05g: dono não pode trocar o próprio plano';
    ok := false;
    begin
      insert into public.pet_petshop (pet_id, petshop_id) values (v_pet_pr, pf);
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, 'FALHOU R05h: vínculo direto deveria ser barrado (só por RPC)';
    ok := false;
    begin
      perform public.bot_entrada(pf, tel_r07);
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, 'FALHOU R05i: RPC do bot não pode ser chamada pelo painel';
    reset role;
    saida := saida || 'OK R05 RLS do dono (isolamento, plano protegido, vínculo só por RPC, RPC do bot fechada)'::text;

    -- ------------------------------------------------------------ R06 RLS: dono do Pata Amiga
    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert not exists (select 1 from public.agendamentos x where x.petshop_id = pf), 'FALHOU R06a: Pata Amiga vendo agenda do Pet Feliz';
    v_tutor := public.cadastrar_tutor(pr, '(19) 98888-7777', 'Carla S.');
    assert v_tutor = t_carla, 'FALHOU R06b: deveria reaproveitar o tutor global';
    assert (select tp.nome from public.tutor_petshop tp where tp.tutor_id = v_tutor and tp.petshop_id = pr) = 'Carla S.',
           'FALHOU R06c: nome é do vínculo do Pata Amiga';
    assert not exists (select 1 from public.pets x where x.tutor_id = t_carla), 'FALHOU R06d: Pata Amiga não pode ver pets da Carla';
    reset role;
    saida := saida || 'OK R06 RLS do outro pet shop e cadastro de tutor sem vazamento'::text;

    -- ------------------------------------------------------------ R07 BOT
    -- Tutor e pet criados aqui, só no Pata Amiga, com consentimento de compartilhar.
    insert into public.tutores (telefone) values (tel_r07) returning id into t_r07;
    insert into public.tutor_petshop (tutor_id, petshop_id, nome, origem) values (t_r07, pr, 'Teste Regressão', 'bot');
    insert into public.pets (tutor_id, nome, especie, porte, criado_por_petshop_id)
    values (t_r07, 'Bolt R07', 'cao', 'M', pr) returning id into p_r07;
    insert into public.pet_petshop (pet_id, petshop_id) values (p_r07, pr);
    insert into public.consentimentos (tutor_id, escopo, versao_termo, canal, petshop_origem_id)
    values (t_r07, 'compartilhar_dados_pet', 'v0-teste', 'bot', pr);

    r := public.bot_entrada(pf, substr(tel_r07, 2));
    assert (r ->> 'conhecido_aqui')::boolean = false, 'FALHOU R07a: tutor do teste não é cliente do Pet Feliz';
    assert r -> 'pets_compartilhaveis' @> jsonb_build_array(jsonb_build_object('id', p_r07)), 'FALHOU R07b: o pet deveria ser oferecido';
    assert r::text not ilike '%pata amiga%' and r::text not ilike '%rival%', 'FALHOU R07c: resposta do bot não pode citar o outro pet shop';
    perform public.bot_vincular_pet_compartilhado(pf, t_r07, p_r07);
    r := public.bot_entrada(pf, tel_r07);
    assert (r ->> 'conhecido_aqui')::boolean and jsonb_array_length(r -> 'pets') = 1, 'FALHOU R07d: pet vinculado';
    perform public.bot_pausar_por_humano(pf, tel_r07);
    r := public.bot_entrada(pf, tel_r07);
    assert r ->> 'estado' = 'humano', 'FALHOU R07e: deveria estar em pausa humana';
    update public.bot_conversas set humano_ate = now() - interval '1 min' where telefone = tel_r07 and petshop_id = pf;
    r := public.bot_entrada(pf, tel_r07);
    assert r ->> 'estado' = 'idle', 'FALHOU R07f: pausa deveria expirar';
    perform * from public.lembretes_pendentes();
    saida := saida || 'OK R07 bot (tutor de outro pet shop, vínculo com consentimento, pausa humana)'::text;

    -- ------------------------------------------------------------ R08 e R09 COMPARTILHAMENTO
    -- Bob no Pet Feliz (pode já estar, pelos testes do bot; a função não duplica).
    perform public.bot_vincular_pet_compartilhado(pf, t_elisa, p_bob);
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select x.alergias from public.pets x where x.id = p_bob) = 'Frango', 'FALHOU R08a: dado de saúde do Bob compartilhado';
    assert exists (select 1 from public.pet_eventos e where e.pet_id = p_bob and e.petshop_id = pr and e.tipo = 'vacina'),
           'FALHOU R08b: vacina compartilhável do Pata Amiga visível';
    assert not exists (select 1 from public.pet_eventos e where e.pet_id = p_bob and e.petshop_id = pr and e.tipo = 'estetica'),
           'FALHOU R08c: banho do Pata Amiga NUNCA pode aparecer';
    assert not exists (select 1 from public.tutor_petshop tp where tp.petshop_id = pr), 'FALHOU R08d: vínculo comercial do Pata Amiga vazou';
    reset role;
    saida := saida || 'OK R08 compartilhamento: vacina sim, banho e dados comerciais não'::text;

    update public.consentimentos set revogado_em = now()
     where tutor_id = t_elisa and escopo = 'compartilhar_saude' and revogado_em is null;
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert not exists (select 1 from public.pet_eventos e where e.pet_id = p_bob and e.petshop_id = pr),
           'FALHOU R09: revogado o consentimento, a vacina deveria sumir';
    reset role;
    saida := saida || 'OK R09 revogação de consentimento'::text;

    raise exception 'FIM_DA_REGRESSAO';
  exception
    when assert_failure then
      saida := saida || sqlerrm;
    when others then
      if sqlerrm = 'FIM_DA_REGRESSAO' then
        saida := saida || 'REGRESSÃO OK ✅ (nada foi gravado)'::text;
      else
        saida := saida || ('ERRO inesperado: ' || sqlerrm || ' [' || sqlstate || ']');
      end if;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  return query select unnest(saida);
end $fn$;

revoke all on function private.aceite_regressao() from public, anon, authenticated;

select * from private.aceite_regressao() as resultado;
