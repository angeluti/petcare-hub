-- =====================================================================
-- PetCare Hub · Teste de aceite da rodada D do painel (arquivo 17)
--   D1 RL-02/RL-03: relatório com números conferidos à mão; só dono/gerente/super admin
--   D2 RL-03: cancelado_por (painel = pet shop, bot = tutor, escolha explícita, reabrir limpa)
--   D3 BT-09: pausar pelo painel, listar, devolver; pausa automática sem usuário; Pet Rival isolado
--   D4 celular de avisos: dono edita; igual ao WhatsApp recusado; canal/instância/token/ativo protegidos
--   D5 TP-12/TP-15: histórico de quem ligou/desligou as mensagens; consentimento visível ao dono
-- Rode no SQL Editor depois do arquivo 17, com o seed de teste. Tudo é desfeito no final.
-- Resultado esperado: "OK D1…D5" e "ACEITE RODADA D OK ✅".
-- =====================================================================

create or replace function private.aceite_rodada_d() returns setof text
language plpgsql volatile as $fn$
declare
  tz  constant text := 'America/Sao_Paulo';
  pf  constant uuid := '11111111-1111-4111-8111-111111111111';
  pr  constant uuid := '22222222-2222-4222-8222-222222222222';
  t_carla constant uuid := 'c0000000-0000-4000-8000-000000000001';
  p_thor  constant uuid := 'd0000000-0000-4000-8000-000000000001';
  u_pf uuid; u_pr uuid; ana uuid;
  seg date; d date; i int; n int; ok boolean; r jsonb; t jsonb;
  v_ag uuid; v_conv public.bot_conversas; v_wp text;
  saida text[] := '{}';
begin
  perform set_config('plpgsql.check_asserts', 'on', true);
  select id into u_pf from auth.users where email = 'petfeliz@gmail.com';
  select id into u_pr from auth.users where email = 'pataamigapetshop@outlook.com';
  select id into ana from public.recursos where petshop_id = pf and nome = 'Ana';

  begin
    assert u_pf is not null and u_pr is not null and ana is not null, 'FALHOU D0: seed de teste incompleto (arquivos 08 e 09)';

    -- ======================================================== D1 relatório
    -- Semana de teste: segunda-feira de 10 semanas atrás (sem agendamentos do seed)
    seg := (date_trunc('week', (now() at time zone tz)) - interval '70 days')::date;
    assert not exists (select 1 from public.agendamentos where petshop_id = pf
                        and inicio >= seg::timestamp at time zone tz and inicio < (seg + 7)::timestamp at time zone tz),
           'FALHOU D1: a semana de teste já tem agendamentos';

    -- 11 atendimentos, um por hora na terça, todos encaixe (sem regra de capacidade)
    --   6 entregues (4 bot, 2 manual) · 2 no-show (1 bot, 1 manual) · 1 sem desfecho (manual)
    --   1 cancelado pelo tutor no WhatsApp (bot) · 1 cancelado pelo pet shop (manual)
    d := seg + 1;
    for i in 1..11 loop
      insert into public.agendamentos (petshop_id, recurso_id, pet_id, tutor_id, inicio, fim, status, origem, encaixe)
      values (pf, ana, p_thor, t_carla,
              (d + make_time(7 + i, 0, 0)) at time zone tz, (d + make_time(7 + i, 30, 0)) at time zone tz,
              'confirmado', case when i in (1,2,3,4,7,10) then 'bot' else 'manual' end, true)
      returning id into v_ag;
      if i <= 6 then
        update public.agendamentos set status = 'em_atendimento' where id = v_ag;
        update public.agendamentos set status = 'entregue' where id = v_ag;
      elsif i in (7, 8) then
        update public.agendamentos set status = 'no_show' where id = v_ag;
      elsif i = 10 then
        update public.agendamentos set status = 'cancelado', motivo_cancelamento = 'Cancelado pelo tutor no WhatsApp' where id = v_ag;
      elsif i = 11 then
        update public.agendamentos set status = 'cancelado', cancelado_por = 'petshop', motivo_cancelamento = 'Fechamos mais cedo' where id = v_ag;
      end if;  -- i = 9 fica confirmado: sem desfecho
    end loop;

    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.relatorio_poc(pf, seg, seg + 6);
    t := r->'totais';
    assert (t->>'total')::int = 11,           format('FALHOU D1: total %s (esperado 11)', t->>'total');
    assert (t->>'nao_cancelados')::int = 9,   format('FALHOU D1: não cancelados %s (esperado 9)', t->>'nao_cancelados');
    assert (t->>'pelo_bot')::int = 5,         format('FALHOU D1: pelo bot %s (esperado 5)', t->>'pelo_bot');
    assert (t->>'pct_bot')::numeric = 55.6,   format('FALHOU D1: %% bot %s (esperado 55.6)', t->>'pct_bot');
    assert (t->>'entregues')::int = 6 and (t->>'no_show')::int = 2, 'FALHOU D1: entregues/no-show';
    assert (t->>'pct_no_show')::numeric = 25.0, format('FALHOU D1: no-show %s%% (esperado 25.0)', t->>'pct_no_show');
    assert (t->>'sem_desfecho')::int = 1,     format('FALHOU D1: sem desfecho %s (esperado 1)', t->>'sem_desfecho');
    assert (t->>'cancelados')::int = 2 and (t->>'cancel_tutor')::int = 1 and (t->>'cancel_tutor_bot')::int = 1
           and (t->>'cancel_petshop')::int = 1, 'FALHOU D1: separação dos cancelamentos';
    assert (t->>'pct_cancelamento')::numeric = 18.2, format('FALHOU D1: cancelamento %s%% (esperado 18.2)', t->>'pct_cancelamento');
    assert jsonb_array_length(r->'semanas') = 1 and (r->'semanas'->0->>'semana')::date = seg,
           'FALHOU D1: visão semanal';
    reset role;

    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.relatorio_poc(pf, seg, seg + 6);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU D1: dono do Pet Rival leu o relatório do Pet Feliz';
    reset role;
    saida := saida || 'OK D1 RL-02/RL-03: 11 atendimentos → bot 55,6% · no-show 25,0% · cancelamento 18,2% (1 tutor, 1 pet shop) · 1 sem desfecho; Pet Rival barrado'::text;

    -- ======================================================== D2 cancelado_por
    -- usa o agendamento "sem desfecho" (i = 9)
    select id into v_ag from public.agendamentos
     where petshop_id = pf and status = 'confirmado' and inicio = (d + time '16:00') at time zone tz;
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.agendamentos set status = 'cancelado' where id = v_ag;
    assert (select cancelado_por from public.agendamentos where id = v_ag) = 'petshop', 'FALHOU D2: painel sem escolha deveria ser petshop';
    update public.agendamentos set status = 'pendente' where id = v_ag;
    assert (select cancelado_por from public.agendamentos where id = v_ag) is null, 'FALHOU D2: reabrir não limpou cancelado_por';
    update public.agendamentos set status = 'cancelado', cancelado_por = 'tutor', motivo_cancelamento = 'Tutor ligou' where id = v_ag;
    assert (select cancelado_por from public.agendamentos where id = v_ag) = 'tutor', 'FALHOU D2: escolha explícita do painel';
    update public.agendamentos set status = 'pendente' where id = v_ag;
    reset role;
    perform set_config('request.jwt.claims', '{}', true);     -- como o N8n (sem usuário)
    update public.agendamentos set status = 'cancelado' where id = v_ag;
    assert (select cancelado_por from public.agendamentos where id = v_ag) = 'tutor', 'FALHOU D2: bot deveria ser tutor';
    saida := saida || 'OK D2 RL-03: cancelado pelo painel = pet shop (ou tutor, se escolhido); pelo bot = tutor; reabrir limpa'::text;

    -- ======================================================== D3 BT-09
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_conv := public.pausar_bot_tutor(pf, '(19) 98888-7777');            -- Carla
    assert v_conv.estado = 'humano' and v_conv.tutor_id = t_carla, 'FALHOU D3: pausa não ligou ao tutor';
    assert v_conv.humano_ate between now() + interval '3 hours 59 minutes' and now() + interval '4 hours 1 minute',
           'FALHOU D3: humano_ate deveria ser agora + pausa_humana_horas (4)';
    assert v_conv.humano_desde is not null and v_conv.humano_por = u_pf, 'FALHOU D3: desde/por não preenchidos';
    assert exists (select 1 from public.conversas_pausadas(pf) c
                    where c.conversa_id = v_conv.id and c.tutor_nome = 'Carla Souza' and c.pausado_por_painel),
           'FALHOU D3: conversa não aparece na lista';
    perform public.bot_devolver(v_conv.id);
    select * into v_conv from public.bot_conversas where id = v_conv.id;
    assert v_conv.estado = 'idle' and v_conv.humano_ate is null and v_conv.dados_temp = '{}'::jsonb
           and v_conv.humano_desde is null, 'FALHOU D3: devolver ao bot';
    reset role;

    -- pausa automática (dono respondeu pelo celular): sem usuário
    perform set_config('request.jwt.claims', '{}', true);
    perform public.bot_pausar_por_humano(pf, '+5519977776666');           -- Diego
    assert (select humano_por is null and humano_desde is not null from public.bot_conversas
             where petshop_id = pf and telefone = '+5519977776666'), 'FALHOU D3: pausa automática';

    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select count(*) from public.conversas_pausadas(pf)) = 0, 'FALHOU D3: Pet Rival vê conversas do Pet Feliz';
    ok := false;
    begin perform public.pausar_bot_tutor(pf, '+5519988887777');
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU D3: Pet Rival pausou o bot do Pet Feliz';
    reset role;
    saida := saida || 'OK D3 BT-09: pausar pelo painel (4 h), listar com nome do tutor, devolver; pausa automática sem usuário; Pet Rival isolado'::text;

    -- ======================================================== D4 bot_config
    select telefone_wp into v_wp from public.petshops where id = pf;
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.bot_config set telefone_avisos = '+5519911112222', nome_bot = 'Luna' where petshop_id = pf;
    assert (select telefone_avisos from public.bot_config where petshop_id = pf) = '+5519911112222', 'FALHOU D4: dono não salvou o celular';
    ok := false; begin update public.bot_config set telefone_avisos = v_wp where petshop_id = pf;
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU D4: celular igual ao WhatsApp do pet shop foi aceito';
    ok := false; begin update public.bot_config set telefone_avisos = '19911112222' where petshop_id = pf;
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU D4: celular fora do E.164 foi aceito';
    -- arquivo 18: formato de celular
    ok := false; begin update public.bot_config set telefone_avisos = '+19911100' where petshop_id = pf;
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU D4: número curto aceito (rodou o arquivo 18?)';
    ok := false; begin update public.bot_config set telefone_avisos = '+551933112222' where petshop_id = pf;
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU D4: fixo brasileiro aceito como celular';
    update public.bot_config set telefone_avisos = '+14155552671' where petshop_id = pf;
    assert (select telefone_avisos from public.bot_config where petshop_id = pf) = '+14155552671', 'FALHOU D4: celular estrangeiro recusado';
    ok := false; begin update public.bot_config set canal = 'teste' where petshop_id = pf;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU D4: dono trocou o canal';
    ok := false; begin update public.bot_config set zapi_instance_id = 'invasao' where petshop_id = pf;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU D4: dono trocou a instância';
    ok := false; begin update public.bot_config set token_secret_id = gen_random_uuid() where petshop_id = pf;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU D4: dono trocou o token';
    ok := false; begin update public.bot_config set ativo = not ativo where petshop_id = pf;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU D4: dono ligou/desligou o bot';
    ok := false; begin insert into public.bot_config (petshop_id) values (pf);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU D4: dono criou bot_config';
    reset role;
    saida := saida || 'OK D4 celular de avisos: dono edita; igual ao WhatsApp, fora do E.164, curto e fixo recusados; canal, instância, token e ativo protegidos'::text;

    -- ======================================================== D5 TP-12 / TP-15
    perform set_config('request.jwt.claims', '{}', true);     -- tutor manda SAIR (bot)
    update public.tutor_petshop set aceita_mensagens = false where petshop_id = pf and tutor_id = t_carla;
    assert (select mensagens_alterado_origem = 'bot' and mensagens_alterado_por is null and opt_out_em is not null
              from public.tutor_petshop where petshop_id = pf and tutor_id = t_carla), 'FALHOU D5: SAIR pelo bot não registrado';

    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.tutor_petshop set aceita_mensagens = true where petshop_id = pf and tutor_id = t_carla;
    assert (select mensagens_alterado_origem = 'painel' and mensagens_alterado_por = u_pf and opt_out_em is null
              and mensagens_alterado_em is not null
              from public.tutor_petshop where petshop_id = pf and tutor_id = t_carla), 'FALHOU D5: religar no balcão não registrou quem e quando';
    reset role;

    -- consentimento: quem tem vínculo enxerga; quem não tem, não
    insert into public.consentimentos (tutor_id, escopo, versao_termo, canal, petshop_origem_id)
    values (t_carla, 'compartilhar_dados_pet', 'v0-teste', 'bot', pf);
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert exists (select 1 from public.consentimentos where tutor_id = t_carla and revogado_em is null),
           'FALHOU D5: dono não vê o consentimento do tutor';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert not exists (select 1 from public.consentimentos where tutor_id = t_carla),
           'FALHOU D5: Pet Rival vê consentimento de tutor que não é dele';
    reset role;
    saida := saida || 'OK D5 TP-12/TP-15: SAIR pelo bot e religar no balcão ficam registrados (origem, quem, quando); consentimento visível só a quem tem vínculo'::text;

    raise exception 'FIM_DO_ACEITE';
  exception
    when assert_failure then saida := saida || sqlerrm;
    when others then
      if sqlerrm = 'FIM_DO_ACEITE' then saida := saida || 'ACEITE RODADA D OK ✅ (nada foi gravado)'::text;
      else saida := saida || ('ERRO inesperado: ' || sqlerrm || ' [' || sqlstate || ']'); end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return query select unnest(saida);
end $fn$;

revoke all on function private.aceite_rodada_d() from public, anon, authenticated;

select * from private.aceite_rodada_d() as resultado;
-- Para remover depois da POC: drop function private.aceite_rodada_d();
