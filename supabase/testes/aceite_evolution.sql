-- =====================================================================
-- PetCare Hub · aceite do arquivo 19 (canal Evolution)
-- Uso no SQL Editor:  select private.aceite_evolution();
-- Esperado: "ACEITE EVOLUTION OK". Tudo é desfeito no final.
--   V1 canal 'evolution' sem instância é recusado
--   V2 instância fora do formato é recusada
--   V3 roteamento por canal + instância
--   V4 bot_envio devolve canal e instância
--   V5 bot_instancias_monitoradas lista a instância
--   V6 bot_conexao_evento: queda alerta, volta alerta
--   V7 mensagens_log grava canal 'evolution'
--   V8 fromMe: eco do bot ignorado, mensagem do dono pausa
--   V9 instância repetida é recusada
-- =====================================================================
create or replace function private.aceite_evolution() returns text
language plpgsql set search_path = '' as $$
declare
  v_ps    uuid;
  v_ps2   uuid;
  v_tel   constant text := '+5519900001234';
  v_inst  constant text := 'aceite-evolution';
  v_j     jsonb;
  v_txt   text;
  v_ok    boolean;
begin
  begin
    select petshop_id into v_ps from public.bot_config order by petshop_id limit 1;
    if v_ps is null then raise exception 'Aceite precisa de ao menos um bot_config (seed 08)'; end if;
    select petshop_id into v_ps2 from public.bot_config where petshop_id <> v_ps order by petshop_id limit 1;

    -- V1
    v_ok := false;
    begin
      update public.bot_config set canal = 'evolution', instancia = null, zapi_instance_id = null where petshop_id = v_ps;
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception 'V1 falhou: canal evolution sem instância foi aceito'; end if;

    -- V2
    v_ok := false;
    begin
      update public.bot_config set canal = 'evolution', instancia = 'Pet Feliz' where petshop_id = v_ps;
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then raise exception 'V2 falhou: instância "Pet Feliz" foi aceita'; end if;

    update public.bot_config
       set canal = 'evolution', instancia = v_inst, ativo = true, conexao_status = 'conectado', conexao_alertado_em = null
     where petshop_id = v_ps;

    -- V3
    if public.bot_petshop_por_canal('evolution', v_inst) is distinct from v_ps then
      raise exception 'V3 falhou: bot_petshop_por_canal não achou o pet shop';
    end if;
    if public.bot_petshop_por_canal('zapi', v_inst) is not null then
      raise exception 'V3 falhou: achou o pet shop com o canal errado';
    end if;
    if public.bot_petshop_por_canal('evolution', null) is not null then
      raise exception 'V3 falhou: instância nula achou pet shop';
    end if;

    -- V4
    v_j := public.bot_envio(v_ps);
    if v_j->>'canal' <> 'evolution' or v_j->>'instancia' <> v_inst then
      raise exception 'V4 falhou: bot_envio devolveu %', v_j;
    end if;

    -- V5
    if not exists (select 1 from public.bot_instancias_monitoradas() m
                    where m.petshop_id = v_ps and m.canal = 'evolution' and m.instancia = v_inst) then
      raise exception 'V5 falhou: instância fora de bot_instancias_monitoradas';
    end if;

    -- V6
    v_j := public.bot_conexao_evento(v_inst, false, 'aceite: close 401');
    if not (v_j->>'encontrado')::boolean or not (v_j->>'alertar_queda')::boolean or v_j->>'status' <> 'desconectado' then
      raise exception 'V6 falhou na queda: %', v_j;
    end if;
    v_j := public.bot_conexao_evento(v_inst, false, 'aceite: ainda caído');
    if (v_j->>'alertar_queda')::boolean then
      raise exception 'V6 falhou: alertou a queda de novo antes de 6 h';
    end if;
    v_j := public.bot_conexao_evento(v_inst, true, 'aceite: open');
    if not (v_j->>'alertar_volta')::boolean or v_j->>'status' <> 'conectado' then
      raise exception 'V6 falhou na volta: %', v_j;
    end if;

    -- V7
    perform public.bot_registrar_mensagem(v_ps, v_tel, 'saida', 'conversa', 'enviada', null, 'EVO-ACEITE-1', null);
    select canal into v_txt from public.mensagens_log where petshop_id = v_ps and id_externo = 'EVO-ACEITE-1';
    if v_txt is distinct from 'evolution' then
      raise exception 'V7 falhou: mensagens_log.canal = %', v_txt;
    end if;

    -- V8
    v_txt := public.bot_registrar_fromme(v_ps, v_tel, 'EVO-ACEITE-1', null);
    if v_txt <> 'eco_do_bot' then raise exception 'V8 falhou: eco do bot virou %', v_txt; end if;
    v_txt := public.bot_registrar_fromme(v_ps, v_tel, 'EVO-ACEITE-2', null);
    if v_txt <> 'pausado' then raise exception 'V8 falhou: mensagem do dono virou %', v_txt; end if;
    if not exists (select 1 from public.bot_conversas
                    where petshop_id = v_ps and telefone = v_tel and estado = 'humano') then
      raise exception 'V8 falhou: conversa não ficou em humano';
    end if;

    -- V9
    if v_ps2 is not null then
      v_ok := false;
      begin
        update public.bot_config set canal = 'evolution', instancia = v_inst where petshop_id = v_ps2;
      exception when unique_violation then v_ok := true;
      end;
      if not v_ok then raise exception 'V9 falhou: instância repetida foi aceita'; end if;
    end if;

    raise exception using errcode = 'P0001', message = 'ACEITE_EVOLUTION_DESFAZER';
  exception
    when others then
      if sqlerrm = 'ACEITE_EVOLUTION_DESFAZER' then
        return 'ACEITE EVOLUTION OK';
      end if;
      raise;
  end;
end $$;

revoke all on function private.aceite_evolution() from public;

select private.aceite_evolution();
