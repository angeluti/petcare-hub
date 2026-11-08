-- =====================================================================
-- PetCare Hub · Aceite do arquivo 13 (RPCs do bot no N8n)
-- Rode no SQL Editor depois dos arquivos 13 a 16, com o seed de teste (Pet Feliz).
-- Tudo é desfeito no final. Resultado esperado: "ACEITE BOT OK".
--   B1 bot_servicos e bot_envio
--   B2 fromMe: eco do bot não pausa; mensagem do dono pausa
--   B3 lembretes: bot desligado, bloqueio e limite semanal (CM-10)
--   B4 lembrete marcado uma vez; SIM confirma; NÃO cancela
--   B5 aviso de agendamento em bloqueio
--   B6 conexão: alerta na queda, sem repetir, alerta na volta
--   B7 log de erro; RPCs fechadas para o usuário logado
--   B8 canal de teste: só acha pet shop com canal 'teste' (arquivo 14)
--   B9 nome do tutor compartilhado só com consentimento (arquivo 15)
--   B10 consentimento pelo bot: pergunta uma vez, SIM grava com versão, REVOGAR desfaz (arquivo 16)
--   B11 SAIR desliga o lembrete, ATIVAR religa (arquivo 16)
-- =====================================================================
create or replace function private.aceite_bot() returns setof text
language plpgsql set search_path = '' as $$
declare
  pf     uuid := '11111111-1111-4111-8111-111111111111';
  ana    uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  s_banho uuid := 'b0000000-0000-4000-8000-000000000001';
  t_carla uuid := 'c0000000-0000-4000-8000-000000000001';
  p_mel  uuid := 'd0000000-0000-4000-8000-000000000002';
  tel    text := '+5519988887777';
  tz     text := 'America/Sao_Paulo';
  amanha date := (now() at time zone 'America/Sao_Paulo')::date + 1;
  v_ag   public.agendamentos;
  v_j    jsonb;
  v_t    text;
  v_n    int;
  v_b    boolean;
  msgs   text[] := '{}';
begin
  begin
    -- Preparação: bot ligado, instância e avisos no Pet Feliz
    update public.bot_config set ativo = true, zapi_instance_id = 'INST-TESTE',
           telefone_avisos = '+5519911112222', conexao_status = 'conectado', conexao_alertado_em = null
     where petshop_id = pf;
    -- Agendamento de amanhã às 10:00 (encaixe: independe do dia da semana)
    v_ag := public.reservar_agendamento(pf, p_mel, t_carla, array[s_banho],
              ((amanha + time '10:00') at time zone tz), ana, 'manual', null, true);

    -- B1
    v_j := public.bot_servicos(pf, 'P');
    assert jsonb_array_length(v_j) = 3, 'B1: Pet Feliz deveria oferecer 3 serviços (sem a Hidratação, que é adicional)';
    assert not (v_j @> '[{"nome":"Hidratação"}]'), 'B1: adicional não pode aparecer';
    v_j := public.bot_envio(pf);
    assert v_j ->> 'zapi_instance_id' = 'INST-TESTE' and v_j ->> 'telefone_avisos' = '+5519911112222', 'B1: bot_envio';
    v_j := public.bot_aberto_agora(pf);
    assert v_j ? 'aberto', 'B1: bot_aberto_agora';
    msgs := msgs || 'OK B1 serviços do bot, dados de envio e horário'::text;

    -- B2
    perform public.bot_registrar_mensagem(pf, tel, 'saida', 'conversa', null, null, 'MSG-DO-BOT');
    v_t := public.bot_registrar_fromme(pf, tel, 'MSG-DO-BOT', null);
    assert v_t = 'eco_do_bot', 'B2: eco do bot pausou o bot';
    v_t := public.bot_registrar_fromme(pf, tel, 'qualquer', true);
    assert v_t = 'eco_do_bot', 'B2: fromApi=true deveria ser ignorado';
    v_t := public.bot_registrar_fromme(pf, tel, 'MSG-DO-DONO', false);
    assert v_t = 'pausado', 'B2: mensagem do dono deveria pausar';
    select count(*) into v_n from public.bot_conversas where petshop_id = pf and telefone = tel and estado = 'humano';
    assert v_n = 1, 'B2: conversa deveria estar em humano';
    msgs := msgs || 'OK B2 fromMe: eco do bot ignorado, dono pausa o bot'::text;

    -- B3
    select count(*) into v_n from public.lembretes_pendentes(pf) where agendamento_id = v_ag.id;
    assert v_n = 1, 'B3: lembrete de amanhã deveria estar pendente';
    update public.bot_config set ativo = false where petshop_id = pf;
    select count(*) into v_n from public.lembretes_pendentes(pf) where agendamento_id = v_ag.id;
    assert v_n = 0, 'B3: bot desligado não manda lembrete';
    update public.bot_config set ativo = true where petshop_id = pf;
    insert into public.bloqueios (petshop_id, recurso_id, tipo, inicio, fim, motivo)
    values (pf, ana, 'folga', v_ag.inicio, v_ag.fim, 'teste') ;
    select count(*) into v_n from public.lembretes_pendentes(pf) where agendamento_id = v_ag.id;
    assert v_n = 0, 'B3: agendamento em bloqueio não recebe lembrete';
    -- B5 aproveita o bloqueio
    select count(*) into v_n from public.bot_agendamentos_em_bloqueio(pf) e
     where e.itens @> '[{"pet":"Mel"}]';
    assert v_n = 1, 'B5: aviso de agendamento em bloqueio';
    delete from public.bloqueios where petshop_id = pf and motivo = 'teste';
    update public.bot_config set limite_msgs_auto_semana = 1 where petshop_id = pf;
    perform public.bot_registrar_mensagem(pf, tel, 'saida', 'lembrete');
    select count(*) into v_n from public.lembretes_pendentes(pf) where agendamento_id = v_ag.id;
    assert v_n = 0, 'B3: limite semanal atingido deveria segurar o lembrete';
    update public.bot_config set limite_msgs_auto_semana = 3 where petshop_id = pf;
    msgs := msgs || 'OK B3 lembrete respeita bot desligado, bloqueio e limite semanal'::text;
    msgs := msgs || 'OK B5 dono avisado de agendamento em período bloqueado'::text;

    -- B4
    v_b := public.bot_lembrete_marcar(v_ag.id);
    assert v_b, 'B4: primeira marcação';
    v_b := public.bot_lembrete_marcar(v_ag.id);
    assert not v_b, 'B4: segunda marcação deveria ser recusada';
    v_j := public.bot_responder_lembrete(pf, '19988887777', 'sim');
    assert (v_j ->> 'acao') = 'confirmado', 'B4: SIM';
    v_j := public.bot_responder_lembrete(pf, tel, 'nao');
    assert not (v_j ->> 'encontrado')::boolean, 'B4: lembrete já respondido não pode ser reaproveitado';
    -- NÃO: em outro agendamento
    v_ag := public.reservar_agendamento(pf, p_mel, t_carla, array[s_banho],
              ((amanha + time '11:00') at time zone tz), ana, 'manual', null, true);
    perform public.bot_lembrete_marcar(v_ag.id);
    v_j := public.bot_responder_lembrete(pf, tel, 'nao');
    assert (v_j ->> 'acao') = 'cancelado' and (v_j ->> 'telefone_avisos') = '+5519911112222', 'B4: NÃO';
    select count(*) into v_n from public.agendamentos where id = v_ag.id and status = 'cancelado';
    assert v_n = 1, 'B4: NÃO deveria cancelar o agendamento';
    msgs := msgs || 'OK B4 lembrete marcado uma vez; SIM confirma; NÃO cancela e traz o telefone do dono'::text;

    -- B6
    v_j := public.bot_conexao_evento('INST-TESTE', false, 'teste');
    assert (v_j ->> 'alertar_queda')::boolean, 'B6: queda deveria alertar';
    v_j := public.bot_conexao_evento('INST-TESTE', false, 'teste');
    assert not (v_j ->> 'alertar_queda')::boolean, 'B6: queda repetida não alerta antes de 6 h';
    v_j := public.bot_conexao_evento('INST-TESTE', true, 'teste');
    assert (v_j ->> 'alertar_volta')::boolean, 'B6: volta deveria avisar';
    v_j := public.bot_conexao_evento('INST-NAO-EXISTE', false);
    assert not (v_j ->> 'encontrado')::boolean, 'B6: instância desconhecida';
    msgs := msgs || 'OK B6 conexão: alerta na queda, sem repetição, aviso na volta'::text;

    -- B7
    perform public.bot_registrar_erro('teste', 'nó', 'erro de teste', '1', null, pf);
    select count(*) into v_n from public.fluxo_erros where workflow = 'teste';
    assert v_n = 1, 'B7: erro registrado';
    assert not has_function_privilege('authenticated', 'public.bot_envio(uuid)', 'execute'),
      'B7: bot_envio não pode ser executável pelo usuário logado (expõe o token)';
    assert not has_function_privilege('authenticated', 'public.bot_responder_lembrete(uuid, text, text)', 'execute'),
      'B7: bot_responder_lembrete fechado';
    assert has_function_privilege('service_role', 'public.bot_envio(uuid)', 'execute'), 'B7: service_role executa';
    msgs := msgs || 'OK B7 log de erro e RPCs fechadas para o usuário logado'::text;

    -- B8
    update public.bot_config set canal = 'zapi' where petshop_id = pf;
    assert public.bot_petshop_teste('pet-feliz-teste') is null, 'B8: canal zapi não pode aparecer no canal de teste';
    update public.bot_config set canal = 'teste' where petshop_id = pf;
    assert public.bot_petshop_teste('pet-feliz-teste') = pf, 'B8: canal teste deveria achar o Pet Feliz';
    assert public.bot_petshop_teste('pet-rival-teste') is null, 'B8: Pet Rival não está no canal de teste';
    assert not has_function_privilege('authenticated', 'public.bot_petshop_teste(text)', 'execute'), 'B8: fechada para o usuário logado';
    msgs := msgs || 'OK B8 canal de teste só alcança pet shop marcado como teste'::text;

    -- B9
    assert public.bot_nome_compartilhado('c0000000-0000-4000-8000-000000000003') is not null,
      'B9: Elisa (com consentimento) deveria ter o nome compartilhado';
    assert public.bot_nome_compartilhado(t_carla) is null, 'B9: Carla (sem consentimento) não pode ter o nome compartilhado';
    assert not has_function_privilege('authenticated', 'public.bot_nome_compartilhado(uuid)', 'execute'), 'B9: fechada para o usuário logado';
    msgs := msgs || 'OK B9 nome do tutor compartilhado só com consentimento'::text;

    -- B10 (Carla: cliente do Pet Feliz, sem consentimento)
    v_j := public.bot_consentimento_pendente(pf, t_carla);
    assert v_j ->> 'versao' is not null and (v_j ->> 'texto') like '%{pet}%', 'B10: termo vigente deveria vir para a Carla';
    v_t := public.bot_registrar_consentimento(pf, t_carla, true, v_j ->> 'versao', '{"teste": true}');
    assert v_t = 'concedido' and private.tutor_consente(t_carla, 'compartilhar_dados_pet'), 'B10: SIM grava o consentimento';
    assert public.bot_consentimento_pendente(pf, t_carla) is null, 'B10: não pergunta de novo';
    select count(*) into v_n from public.consentimentos
     where tutor_id = t_carla and canal = 'bot' and petshop_origem_id = pf and versao_termo = v_j ->> 'versao';
    assert v_n = 1, 'B10: consentimento com canal, origem e versão';
    assert public.bot_revogar_consentimento(t_carla), 'B10: REVOGAR';
    assert not private.tutor_consente(t_carla, 'compartilhar_dados_pet'), 'B10: revogado';
    assert public.bot_consentimento_pendente(pf, t_carla) is null, 'B10: depois de perguntado, não pergunta de novo neste pet shop';
    assert not public.bot_revogar_consentimento(t_carla), 'B10: nada a revogar';
    msgs := msgs || 'OK B10 consentimento: pergunta uma vez, SIM grava com versão e origem, REVOGAR desfaz'::text;

    -- B11
    v_ag := public.reservar_agendamento(pf, p_mel, t_carla, array[s_banho],
              ((amanha + time '16:00') at time zone tz), ana, 'manual', null, true);
    select count(*) into v_n from public.lembretes_pendentes(pf) where agendamento_id = v_ag.id;
    assert v_n = 1, 'B11: lembrete pendente antes do SAIR';
    assert public.bot_definir_mensagens(pf, '19988887777', false), 'B11: SAIR';
    select count(*) into v_n from public.lembretes_pendentes(pf) where agendamento_id = v_ag.id;
    assert v_n = 0, 'B11: depois do SAIR, sem lembrete';
    assert public.bot_definir_mensagens(pf, tel, true), 'B11: ATIVAR';
    select count(*) into v_n from public.lembretes_pendentes(pf) where agendamento_id = v_ag.id;
    assert v_n = 1, 'B11: depois do ATIVAR, lembrete volta';
    assert not public.bot_definir_mensagens(pf, '+5599000009999', false), 'B11: telefone sem vínculo';
    assert not has_function_privilege('authenticated', 'public.bot_registrar_consentimento(uuid, uuid, boolean, text, jsonb)', 'execute'), 'B11: fechada para o usuário logado';
    msgs := msgs || 'OK B11 SAIR desliga o lembrete, ATIVAR religa'::text;

    raise exception 'ROLLBACK_ACEITE';
  exception
    when raise_exception then
      if sqlerrm <> 'ROLLBACK_ACEITE' then
        return next 'FALHOU: ' || sqlerrm; return;
      end if;
    when assert_failure then
      return next 'FALHOU ' || sqlerrm; return;
  end;
  foreach v_t in array msgs loop return next v_t; end loop;
  return next 'ACEITE BOT OK ✅ (nada foi gravado)';
end $$;

select * from private.aceite_bot();
