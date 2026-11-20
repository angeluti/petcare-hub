-- =====================================================================
-- PetCare Hub · 10 · Testes automatizados
-- Pré-requisito: 08_seed e 09_usuarios aplicados.
-- Rev. 09/11/2026: donos de teste com os e-mails atuais (petfeliz@gmail.com e
-- pataamigapetshop@outlook.com); "Pet Rival" é o atual Pata Amiga Petshop.
-- Rev. 21 (11/11/2026): T11 com a ficha pública nova.
--
-- Funciona no SQL Editor do Supabase: todos os testes rodam dentro de
-- UMA chamada de função, num bloco que é sempre desfeito no final
-- (nada é gravado). O resultado aparece como linhas na grade:
--   "OK Txx …" para cada grupo e, no fim, "TODOS OS TESTES OK"
--   ou a linha "FALHOU …" / "ERRO inesperado …" que parou a execução.
-- A função fica no schema private (fora da API) para você rodar de novo:
--   select * from private.rodar_testes_petcare();
-- O arquivo 11 apaga a função junto com os dados de teste.
-- =====================================================================

create or replace function private.rodar_testes_petcare() returns setof text
language plpgsql volatile as $fn$
declare
  tz      constant text := 'America/Sao_Paulo';
  pf      constant uuid := '11111111-1111-4111-8111-111111111111';
  pr      constant uuid := '22222222-2222-4222-8222-222222222222';
  ana     constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  bru     constant uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  s_banho constant uuid := 'b0000000-0000-4000-8000-000000000001';
  s_bt    constant uuid := 'b0000000-0000-4000-8000-000000000003';
  t_carla constant uuid := 'c0000000-0000-4000-8000-000000000001';
  t_diego constant uuid := 'c0000000-0000-4000-8000-000000000002';
  t_elisa constant uuid := 'c0000000-0000-4000-8000-000000000003';
  p_thor  constant uuid := 'd0000000-0000-4000-8000-000000000001';
  p_mel   constant uuid := 'd0000000-0000-4000-8000-000000000002';
  p_nina  constant uuid := 'd0000000-0000-4000-8000-000000000003';
  p_bob   constant uuid := 'd0000000-0000-4000-8000-000000000004';
  d date; f date; u_pf uuid; u_pr uuid;
  saida text[] := '{}';
  n int; ok boolean; v_ag uuid; v_tutor uuid; v_ins uuid; v_req uuid;
  a public.agendamentos; v public.insumos; r jsonb; v_cod text;
begin
  perform set_config('plpgsql.check_asserts', 'on', true);

  select min((x.inicio at time zone tz)::date) into d from public.agendamentos x where x.petshop_id = pf;
  select (b.inicio at time zone tz)::date into f from public.bloqueios b where b.tipo = 'feriado' limit 1;
  select id into u_pf from auth.users where email = 'petfeliz@gmail.com';
  select id into u_pr from auth.users where email = 'pataamigapetshop@outlook.com';

  -- Bloco com tratador de exceção = savepoint. Ele SEMPRE termina em exceção,
  -- o que desfaz tudo o que os testes gravaram. Só o array "saida" sobrevive.
  begin
    assert u_pf is not null and u_pr is not null, 'FALHOU T00: rode o 09_usuarios (usuários de teste não encontrados)';
    assert d is not null, 'FALHOU T00: rode o 08_seed (agenda de teste não encontrada)';
    saida := saida || 'OK T00 seed e usuários de teste encontrados'::text;

    -- ------------------------------------------------------------ T01 MOTOR
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d) h
     where (h.inicio at time zone tz)::time = '09:00';
    assert n = 0, 'FALHOU T01a: 09:00 deveria estar lotado, veio ' || n;
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d) h
     where (h.inicio at time zone tz)::time = '13:00';
    assert n = 2, 'FALHOU T01b: 13:00 deveria ter 2 profissionais, veio ' || n;
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', d) h
     where (h.inicio at time zone tz)::time = '11:30';
    assert n = 0, 'FALHOU T01c: 11:30 atravessa o almoço';
    select count(distinct h.recurso_id) into n from public.horarios_disponiveis(pf, array[s_bt], 'M', d) h;
    assert n = 1, 'FALHOU T01d: banho e tosa deveria listar só a Ana';
    select count(*) into n from public.horarios_disponiveis(pf, array[s_banho], 'M', f);
    assert n = 0, 'FALHOU T01e: feriado deveria vir vazio';
    assert exists (select 1 from public.horarios_livres_resumo(pf, array[s_banho], 'M', d) h where h.hora = '13:00' and h.vagas = 3),
           'FALHOU T01f: resumo das 13:00 deveria somar 3 vagas (Ana 2 + Bruno 1)';
    assert (select count(*) from public.proximos_dias_com_vaga(pf, array[s_banho], 'M', 7)) >= 3,
           'FALHOU T01g: próximos dias com vaga';
    saida := saida || 'OK T01 motor de disponibilidade (lotação, almoço, quem faz o serviço, feriado, resumo)'::text;

    -- ------------------------------------------------------------ T02 CAPACIDADE
    ok := false;
    begin
      insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim)
      values (pf, p_nina, t_diego, ana, (d + time '10:00') at time zone tz, (d + time '10:30') at time zone tz);
    exception when sqlstate '23P01' then ok := true;
    end;
    assert ok, 'FALHOU T02a: 3º pet simultâneo na Ana deveria ser recusado';
    -- 10:30–11:00 cabe: só o Thor está lá (Mel saiu 10:15) e fica a 60 min da última entrada
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
    assert ok, 'FALHOU T02b: entrada escalonada deveria exigir 30 min';
    insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim, encaixe)
    values (pf, p_nina, t_diego, ana, (d + time '09:45') at time zone tz, (d + time '10:15') at time zone tz, true);
    ok := false;
    begin
      insert into public.agendamentos (petshop_id, pet_id, tutor_id, recurso_id, inicio, fim)
      values (pf, p_bob, t_elisa, bru, (d + time '15:00') at time zone tz, (d + time '16:00') at time zone tz);
    exception when foreign_key_violation then ok := true;
    end;
    assert ok, 'FALHOU T02c: pet não vinculado não pode ser agendado';
    saida := saida || 'OK T02 capacidade exata, entrada escalonada, encaixe e FK composta'::text;

    -- ------------------------------------------------------------ T03 RESERVA PELO MOTOR
    a := public.reservar_agendamento(pf, p_nina, t_diego, array[s_banho], (d + time '15:00') at time zone tz, null, 'bot');
    assert a.valor_total = 45 and a.fim - a.inicio = interval '60 min', 'FALHOU T03a: valor/duração do banho M';
    ok := false;
    begin
      perform public.reservar_agendamento(pf, p_nina, t_diego, array[s_banho], (d + time '12:15') at time zone tz, null, 'bot');
    exception when sqlstate '23P01' then ok := true;
    end;
    assert ok, 'FALHOU T03b: horário no almoço deveria ser recusado pelo motor';
    saida := saida || 'OK T03 reservar_agendamento (escolhe profissional, preço e duração por porte)'::text;

    -- ------------------------------------------------------------ T04 STATUS E CHECK-OUT
    select id into v_ag from public.agendamentos where pet_id = p_thor limit 1;
    ok := false;
    begin
      update public.agendamentos set status = 'pronto' where id = v_ag;
    exception when sqlstate '22023' then ok := true;
    end;
    assert ok, 'FALHOU T04a: transição inválida deveria ser barrada';

    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.fazer_checkin(v_ag);
    a := public.fazer_checkout(v_ag, '[{"forma":"pix","valor":155}]');
    assert a.status = 'entregue' and a.valor_total = 155 and a.pagamento_status = 'pago',
           'FALHOU T04b: checkout ' || a.status || ' ' || a.valor_total || ' ' || a.pagamento_status;
    assert a.checkin_em is not null and a.checkout_em is not null, 'FALHOU T04c: carimbos de horário';
    assert (select count(*) from public.pet_eventos e where e.agendamento_id = v_ag and e.tipo = 'estetica' and e.visibilidade = 'privado') = 1,
           'FALHOU T04d: checkout deveria gravar 1 evento estético privado';
    saida := saida || 'OK T04 ciclo de status e check-out como evento único'::text;

    -- ------------------------------------------------------------ T05 RLS: dono do Pet Feliz
    assert (select count(*) from public.petshops) = 1, 'FALHOU T05a: dono vê só o próprio pet shop';
    assert not exists (select 1 from public.agendamentos x where x.petshop_id <> pf), 'FALHOU T05b: vazou agendamento de outro pet shop';
    assert (select count(*) from public.tutores) = 2, 'FALHOU T05c: deveria ver só Carla e Diego';
    assert (select count(*) from public.pets) = 3, 'FALHOU T05d: deveria ver Thor, Mel e Nina';
    assert not exists (select 1 from public.pets x where x.id = p_bob), 'FALHOU T05e: Bob é do Pata Amiga';
    assert not exists (select 1 from public.harpia_contratos), 'FALHOU T05f: contrato Harpia é só do super admin';
    ok := false;
    begin
      update public.petshops set plano_codigo = 'clinic' where id = pf;
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, 'FALHOU T05g: dono não pode trocar o próprio plano';
    ok := false;
    begin
      insert into public.pet_petshop (pet_id, petshop_id) values (p_bob, pf);
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, 'FALHOU T05h: vínculo direto deveria ser barrado (só por RPC)';
    ok := false;
    begin
      perform public.bot_entrada(pf, '+5519966665555');
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, 'FALHOU T05i: RPC do bot não pode ser chamada pelo painel';
    update public.servicos set ativo = ativo where id = s_banho;
    reset role;
    saida := saida || 'OK T05 RLS do dono (isolamento, plano protegido, vínculo só por RPC, RPC do bot fechada)'::text;

    -- ------------------------------------------------------------ T06 RLS: dono do Pata Amiga
    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert not exists (select 1 from public.agendamentos x where x.petshop_id = pf), 'FALHOU T06a: Pata Amiga vendo agenda do Pet Feliz';
    assert (select count(*) from public.minhas_funcionalidades(pr)) = 9, 'FALHOU T06b: Essencial deveria ter 9 funcionalidades';
    v_tutor := public.cadastrar_tutor(pr, '(19) 98888-7777', 'Carla S.');
    assert v_tutor = t_carla, 'FALHOU T06c: deveria reaproveitar o tutor global';
    assert (select tp.nome from public.tutor_petshop tp where tp.tutor_id = v_tutor) = 'Carla S.', 'FALHOU T06d: nome é do vínculo do Pata Amiga';
    assert not exists (select 1 from public.pets x where x.tutor_id = t_carla), 'FALHOU T06e: Pata Amiga não pode ver pets da Carla';
    reset role;
    saida := saida || 'OK T06 RLS do outro pet shop e cadastro de tutor sem vazamento'::text;

    -- ------------------------------------------------------------ T07 BOT
    r := public.bot_entrada(pf, '19966665555');
    assert (r ->> 'conhecido_aqui')::boolean = false, 'FALHOU T07a: Elisa não é cliente do Pet Feliz';
    assert r -> 'pets_compartilhaveis' @> jsonb_build_array(jsonb_build_object('id', p_bob)), 'FALHOU T07b: Bob deveria ser oferecido';
    assert r::text not ilike '%pata amiga%' and r::text not ilike '%rival%', 'FALHOU T07c: resposta do bot não pode citar o outro pet shop';
    perform public.bot_vincular_pet_compartilhado(pf, t_elisa, p_bob);
    r := public.bot_entrada(pf, '+5519966665555');
    assert (r ->> 'conhecido_aqui')::boolean and jsonb_array_length(r -> 'pets') = 1, 'FALHOU T07d: Bob vinculado';
    perform public.bot_pausar_por_humano(pf, '+5519966665555');
    r := public.bot_entrada(pf, '+5519966665555');
    assert r ->> 'estado' = 'humano', 'FALHOU T07e: deveria estar em pausa humana';
    update public.bot_conversas set humano_ate = now() - interval '1 min' where telefone = '+5519966665555' and petshop_id = pf;
    r := public.bot_entrada(pf, '+5519966665555');
    assert r ->> 'estado' = 'idle', 'FALHOU T07f: pausa deveria expirar';
    perform * from public.lembretes_pendentes();
    saida := saida || 'OK T07 bot (tutor de outro pet shop, vínculo com consentimento, pausa humana)'::text;

    -- ------------------------------------------------------------ T08 e T09 COMPARTILHAMENTO
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select x.alergias from public.pets x where x.id = p_bob) = 'Frango', 'FALHOU T08a: dado de saúde do Bob compartilhado';
    assert exists (select 1 from public.pet_eventos e where e.pet_id = p_bob and e.tipo = 'vacina'), 'FALHOU T08b: vacina compartilhável visível';
    assert not exists (select 1 from public.pet_eventos e where e.pet_id = p_bob and e.petshop_id = pr and e.tipo = 'estetica'),
           'FALHOU T08c: banho do Pata Amiga NUNCA pode aparecer';
    assert not exists (select 1 from public.tutor_petshop tp where tp.petshop_id = pr), 'FALHOU T08d: vínculo comercial do Pata Amiga vazou';
    reset role;
    saida := saida || 'OK T08 compartilhamento: vacina sim, banho e dados comerciais não'::text;

    update public.consentimentos set revogado_em = now() where tutor_id = t_elisa and escopo = 'compartilhar_saude';
    set local role authenticated;
    assert not exists (select 1 from public.pet_eventos e where e.pet_id = p_bob and e.petshop_id = pr),
           'FALHOU T09: revogado o consentimento, a vacina deveria sumir';
    reset role;
    saida := saida || 'OK T09 revogação de consentimento'::text;

    -- ------------------------------------------------------------ T10 REGRAS DE DADOS
    ok := false;
    begin
      insert into public.pet_eventos (pet_id, petshop_id, tipo, visibilidade, titulo)
      values (p_thor, pf, 'estetica', 'compartilhavel', 'Banho');
    exception when check_violation then ok := true;
    end;
    assert ok, 'FALHOU T10a: estética compartilhável deveria violar o CHECK';
    ok := false;
    begin
      update public.consentimentos set versao_termo = 'adulterado' where tutor_id = t_elisa and escopo = 'compartilhar_dados_pet';
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, 'FALHOU T10b: consentimento deveria ser imutável';
    saida := saida || 'OK T10 regras de dados (estética nunca compartilha, consentimento imutável)'::text;

    -- ------------------------------------------------------------ T11 PÁGINA PÚBLICA (anon)
    -- Rev. 21: código curto; a ficha nasce desligada e só aparece com o
    -- consentimento 'ficha_publica' do tutor (detalhe em aceite_ficha.sql).
    select q.codigo into v_cod from public.plaquinhas q where q.pet_id = p_thor and q.status = 'ativa' limit 1;
    assert v_cod is not null, 'FALHOU T11a: plaquinha ativa do Thor não encontrada (seed)';
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
    r := public.ficha_publica(lower(v_cod));
    assert r ->> 'estado' = 'desligada' and not r ? 'pet' and r::text not like '%9988887777%',
           'FALHOU T11a: ficha do Thor deveria abrir desligada, sem dados do pet nem do tutor: ' || r::text;
    assert public.ficha_publica('d0000000-0000-4000-8000-000000000001') = '{"estado":"indisponivel"}'::jsonb,
           'FALHOU T11b: o id do pet não pode abrir a ficha';
    ok := false;
    begin
      perform 1 from public.petshops;
    exception when insufficient_privilege then ok := true;
    end;
    assert ok, 'FALHOU T11c: anon não pode ler tabelas';
    reset role;
    saida := saida || 'OK T11 ficha pública (código curto, nasce desligada, id não abre) e anon bloqueado'::text;

    -- ------------------------------------------------------------ T12 ALMOXARIFADO
    insert into public.insumos (petshop_id, nome, unidade) values (pf, 'Shampoo neutro 5 L (teste)', 'frasco') returning id into v_ins;
    insert into public.estoque_movimentos (petshop_id, insumo_id, tipo, quantidade, custo_unitario) values (pf, v_ins, 'entrada_compra', 4, 80);
    insert into public.estoque_movimentos (petshop_id, insumo_id, tipo, quantidade, custo_unitario) values (pf, v_ins, 'entrada_compra', 4, 100);
    insert into public.requisicoes (petshop_id, recurso_id) values (pf, ana) returning id into v_req;
    insert into public.requisicao_itens (requisicao_id, petshop_id, insumo_id, quantidade) values (v_req, pf, v_ins, 1);
    select * into v from public.insumos where id = v_ins;
    assert v.estoque_atual = 7 and v.custo_medio = 90, 'FALHOU T12: estoque ' || v.estoque_atual || ' custo ' || v.custo_medio;
    saida := saida || 'OK T12 almoxarifado: requisição baixa estoque; custo médio ponderado'::text;

    raise exception 'FIM_DOS_TESTES';
  exception
    when assert_failure then
      saida := saida || sqlerrm;
    when others then
      if sqlerrm = 'FIM_DOS_TESTES' then
        saida := saida || 'TODOS OS TESTES OK ✅ (nada foi gravado)'::text;
      else
        saida := saida || ('ERRO inesperado: ' || sqlerrm || ' [' || sqlstate || ']');
      end if;
  end;

  -- O desfazer do bloco já volta o papel e o JWT; isto é só garantia.
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return query select unnest(saida);
end $fn$;

revoke all on function private.rodar_testes_petcare() from public, anon, authenticated;

select * from private.rodar_testes_petcare() as resultado;