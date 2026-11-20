-- =====================================================================
-- PetCare Hub · Aceite do arquivo 21 (ficha pública, plaquinhas, achados)
-- Rode no SQL Editor depois do 21. Usa um pet shop que já existe (de
-- preferência o slug 'pet-feliz'), cria tutor, pet e plaquinha de teste e
-- desfaz TUDO no final. Resultado esperado: "ACEITE FICHA OK".
--
--   F1  código: 6 caracteres Crockford; normalização (minúsculas, O→0, I/L→1)
--   F2  código inexistente e plaquinha desativada respondem igual
--   F3  ficha desligada: só estado, código e contato; nenhum dado do pet
--   F4  nível gravado sem consentimento aparece desligado
--   F5  tutor escolhe "básica" pelo bot: consentimento gravado, ficha básica
--   F6  completa: alergias e PRIMEIRO nome; nunca telefone nem sobrenome
--   F7  outro telefone não consulta nem muda a ficha
--   F8  achado: encaminha ao tutor; repetição em 30 min vira "limite";
--       o próprio tutor recebe "proprio"
--   F9  UPDATE direto no nível da ficha e no código é recusado (42501)
--   F10 permissões: anon só executa ficha_publica
--   F11 consentimento revogado: a ficha volta a aparecer desligada
--   F12 "perdi a plaquinha": desativa e a ficha fica indisponível
--   F13 usuário logado de fora do pet shop não desliga a ficha, não desativa
--       a plaquinha e não gera plaquinha (42501)
--   F14 número central: roteamento, envio e conflito de instância
-- =====================================================================
create or replace function private.aceite_ficha() returns text
language plpgsql set search_path = '' as $$
declare
  v_ps     uuid;
  v_tutor  uuid;
  v_pet    uuid;
  v_plq    uuid;
  v_cod    text;
  v_cod2   text;
  v_j      jsonb;
  v_t      text;
  v_ok     boolean;
  v_tel    constant text := '+5519900000101';
  v_outro  constant text := '+5519900000202';
  v_central constant text := '+5519900000303';
  v_termo  text;
  v_falhou boolean;
begin
  begin
    select id into v_ps from public.petshops where slug = 'pet-feliz';
    if v_ps is null then select id into v_ps from public.petshops limit 1; end if;
    if v_ps is null then raise exception 'Nenhum pet shop no banco para o teste'; end if;

    -- Massa de teste
    insert into public.tutores (telefone) values (v_tel) returning id into v_tutor;
    insert into public.tutor_petshop (tutor_id, petshop_id, nome) values (v_tutor, v_ps, 'Elisa Teste Sobrenome');
    insert into public.pets (tutor_id, nome, especie, raca, porte, alergias, condicoes)
      values (v_tutor, 'Thor Teste', 'cao', 'Shih-tzu', 'P', 'Frango', 'Remédio contínuo') returning id into v_pet;
    insert into public.pet_petshop (pet_id, petshop_id) values (v_pet, v_ps);
    v_cod := public.admin_gerar_plaquinha(v_ps, v_pet, 'essencial', 'aço pintado');
    select id into v_plq from public.plaquinhas where codigo = v_cod;
    delete from public.canais_plataforma where funcao = 'achados';
    insert into public.canais_plataforma (funcao, canal, instancia, telefone_wp, ativo)
      values ('achados', 'evolution', 'aceite-central-x', v_central, true);
    select versao into v_termo from public.termos_consentimento where escopo = 'ficha_publica' and vigente;

    -- F1
    if v_cod !~ '^[0-9A-HJKMNP-TV-Z]{6}$' then raise exception 'F1: código fora do formato: %', v_cod; end if;
    if private.normalizar_codigo(lower(v_cod)) <> v_cod then raise exception 'F1: minúsculas não normalizam'; end if;
    if private.normalizar_codigo('O1L-Ix9') <> '0111X9' then raise exception 'F1: trocas O/I/L e hífen'; end if;
    if private.normalizar_codigo('ABC') is not null or private.normalizar_codigo('UUUUUU') is not null then
      raise exception 'F1: código inválido deveria ser null';
    end if;

    -- F2
    v_j := public.ficha_publica('ZZZZZZ');
    if v_j <> '{"estado":"indisponivel"}'::jsonb then raise exception 'F2: inexistente: %', v_j; end if;
    v_j := public.ficha_publica('não é código');
    if v_j <> '{"estado":"indisponivel"}'::jsonb then raise exception 'F2: lixo: %', v_j; end if;
    v_j := public.ficha_publica(v_pet::text);
    if v_j <> '{"estado":"indisponivel"}'::jsonb then raise exception 'F2: id do pet não pode abrir a ficha'; end if;

    -- F3
    v_j := public.ficha_publica(lower(v_cod));
    if v_j ->> 'estado' <> 'desligada' or v_j ? 'pet' then raise exception 'F3: desligada expôs dados: %', v_j; end if;
    if v_j -> 'contato' ->> 'whatsapp' <> '5519900000303' then raise exception 'F3: contato central: %', v_j; end if;
    if (select leituras from public.plaquinhas where id = v_plq) <> 1 then raise exception 'F3: leitura não contada'; end if;

    -- F4
    perform set_config('petcare.ficha_rpc', 'on', true);
    update public.pets set ficha_nivel = 'completa' where id = v_pet;
    perform set_config('petcare.ficha_rpc', 'off', true);
    v_j := public.ficha_publica(v_cod);
    if v_j ->> 'estado' <> 'desligada' then raise exception 'F4: sem consentimento deveria ser desligada: %', v_j; end if;
    perform set_config('petcare.ficha_rpc', 'on', true);
    update public.pets set ficha_nivel = 'desligada' where id = v_pet;
    perform set_config('petcare.ficha_rpc', 'off', true);

    -- F5
    v_j := public.bot_ficha_consultar(v_cod, v_tel);
    if v_j ->> 'resultado' <> 'ok' or v_j ->> 'nivel' <> 'desligada' or v_j ->> 'termo_versao' is null then
      raise exception 'F5: consultar: %', v_j;
    end if;
    v_t := public.bot_ficha_definir(v_cod, v_tel, 'basica', v_termo, '{"message_id":"aceite"}');
    if v_t <> 'basica' then raise exception 'F5: definir: %', v_t; end if;
    if not private.tutor_consente(v_tutor, 'ficha_publica') then raise exception 'F5: consentimento não gravado'; end if;
    v_j := public.ficha_publica(v_cod);
    if v_j ->> 'estado' <> 'basica' or v_j -> 'pet' ->> 'nome' <> 'Thor Teste' or (v_j -> 'pet') ? 'alergias' then
      raise exception 'F5: básica: %', v_j;
    end if;

    -- F6
    perform public.bot_ficha_definir(v_cod, v_tel, 'completa', v_termo);
    if (select count(*) from public.consentimentos where tutor_id = v_tutor and escopo = 'ficha_publica') <> 1 then
      raise exception 'F6: consentimento duplicado';
    end if;
    v_j := public.ficha_publica(v_cod);
    if v_j ->> 'estado' <> 'completa' or v_j -> 'pet' ->> 'alergias' <> 'Frango' or v_j -> 'pet' ->> 'tutor' <> 'Elisa' then
      raise exception 'F6: completa: %', v_j;
    end if;
    if v_j::text ~ '19900000101' or v_j::text ~ 'Sobrenome' or v_j::text ~ v_pet::text or v_j::text ~ v_tutor::text then
      raise exception 'F6: ficha expôs telefone, sobrenome ou id: %', v_j;
    end if;

    -- F7
    if public.bot_ficha_consultar(v_cod, v_outro) ->> 'resultado' <> 'nao_tutor' then raise exception 'F7: consultar por outro'; end if;
    if public.bot_ficha_definir(v_cod, v_outro, 'desligada', v_termo) <> 'nao_tutor' then raise exception 'F7: definir por outro'; end if;

    -- F8
    v_j := public.bot_achado_registrar(v_cod, v_outro, 'Estou na praça central', '{}');
    if v_j ->> 'resultado' <> 'encaminhado' or v_j ->> 'telefone_tutor' <> v_tel
       or v_j ->> 'pet_nome_publico' <> 'Thor Teste' or v_j ->> 'mensagem' <> 'Estou na praça central' then
      raise exception 'F8: encaminhar: %', v_j;
    end if;
    if public.bot_achado_registrar(v_cod, '+5519900000404', 'outro') ->> 'resultado' <> 'limite' then
      raise exception 'F8: segundo aviso em 30 min deveria ser limite';
    end if;
    if public.bot_achado_registrar(v_cod, v_tel, 'teste') ->> 'resultado' <> 'proprio' then raise exception 'F8: proprio'; end if;
    if public.bot_achado_registrar('ZZZZZZ', v_outro, 'x') ->> 'resultado' <> 'indisponivel' then raise exception 'F8: indisponivel'; end if;
    if (select count(*) from public.achados where plaquinha_id = v_plq) <> 3 then raise exception 'F8: registro dos achados'; end if;

    -- F9
    v_falhou := false;
    begin update public.pets set ficha_nivel = 'desligada' where id = v_pet;
    exception when insufficient_privilege then v_falhou := true; end;
    if not v_falhou then raise exception 'F9: UPDATE direto no nível da ficha passou'; end if;
    v_falhou := false;
    begin update public.plaquinhas set codigo = 'ABCDEF' where id = v_plq;
    exception when insufficient_privilege then v_falhou := true; end;
    if not v_falhou then raise exception 'F9: código da plaquinha mudou'; end if;
    v_falhou := false;
    begin update public.plaquinhas set status = 'desativada' where id = v_plq;
    exception when insufficient_privilege then v_falhou := true; end;
    if not v_falhou then raise exception 'F9: status mudou sem função'; end if;

    -- F10
    if not has_function_privilege('anon', 'public.ficha_publica(text)', 'execute') then raise exception 'F10: anon sem ficha_publica'; end if;
    if has_function_privilege('anon', 'public.bot_achado_registrar(text, text, text, jsonb)', 'execute')
       or has_function_privilege('authenticated', 'public.bot_ficha_definir(text, text, text, text, jsonb)', 'execute')
       or has_function_privilege('anon', 'public.admin_gerar_plaquinha(uuid, uuid, text, text, numeric)', 'execute')
       or has_function_privilege('anon', 'public.painel_ficha_desligar(uuid, uuid)', 'execute') then
      raise exception 'F10: anon ou authenticated executa função restrita';
    end if;
    if has_table_privilege('anon', 'public.achados', 'select') or has_table_privilege('anon', 'public.canais_plataforma', 'select') then
      raise exception 'F10: anon lê tabela restrita';
    end if;

    -- F11
    update public.consentimentos set revogado_em = now() where tutor_id = v_tutor and escopo = 'ficha_publica' and revogado_em is null;
    if public.ficha_publica(v_cod) ->> 'estado' <> 'desligada' then raise exception 'F11: revogado continua aparecendo'; end if;

    -- F12
    if public.bot_ficha_definir(v_cod, v_tel, 'perdida', null) <> 'perdida' then raise exception 'F12: perdida'; end if;
    if public.ficha_publica(v_cod) <> '{"estado":"indisponivel"}'::jsonb then raise exception 'F12: desativada abriu a ficha'; end if;
    if public.bot_achado_registrar(v_cod, v_outro, 'x') ->> 'resultado' <> 'indisponivel' then raise exception 'F12: achado em desativada'; end if;
    v_cod2 := public.admin_gerar_plaquinha(v_ps, v_pet, 'essencial');
    if v_cod2 = v_cod then raise exception 'F12: código reutilizado'; end if;

    -- F13: usuário logado que não é membro do pet shop. (No SQL Editor não há
    -- login nenhum, e o exigir_papel do arquivo 01 libera essa conexão de
    -- administração; por isso o teste simula um usuário do painel.)
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_falhou := false;
    begin perform public.painel_ficha_desligar(v_ps, v_pet);
    exception when insufficient_privilege then v_falhou := true; end;
    if not v_falhou then reset role; raise exception 'F13: usuário de fora do pet shop desligou a ficha'; end if;
    v_falhou := false;
    begin perform public.painel_plaquinha_desativar(v_ps, v_plq, 'teste');
    exception when insufficient_privilege then v_falhou := true; end;
    if not v_falhou then reset role; raise exception 'F13: usuário de fora do pet shop desativou a plaquinha'; end if;
    v_falhou := false;
    begin perform public.admin_gerar_plaquinha(v_ps, v_pet, 'essencial');
    exception when insufficient_privilege then v_falhou := true; end;
    if not v_falhou then reset role; raise exception 'F13: usuário comum gerou plaquinha'; end if;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- F14
    if public.bot_canal_plataforma('evolution', 'aceite-central-x') ->> 'funcao' <> 'achados' then raise exception 'F14: roteamento'; end if;
    if public.bot_canal_plataforma('evolution', 'outra') is not null then raise exception 'F14: instância desconhecida'; end if;
    if public.bot_envio_plataforma('achados') ->> 'instancia' <> 'aceite-central-x' then raise exception 'F14: envio'; end if;
    if not exists (select 1 from public.bot_instancias_monitoradas() where instancia = 'aceite-central-x') then
      raise exception 'F14: central fora do monitoramento';
    end if;
    v_j := public.bot_conexao_evento('aceite-central-x', false, 'aceite');
    if not (v_j ->> 'encontrado')::boolean or not (v_j ->> 'alertar_queda')::boolean then raise exception 'F14: conexão: %', v_j; end if;
    v_falhou := false;
    begin
      update public.bot_config set instancia = 'aceite-central-x'
       where petshop_id = (select petshop_id from public.bot_config limit 1);
      if found then v_falhou := false; else v_falhou := true; end if;   -- sem bot_config: nada a testar
    exception when unique_violation or insufficient_privilege then v_falhou := true; end;
    if not v_falhou then raise exception 'F14: pet shop pegou a instância do número central'; end if;

    raise exception using errcode = 'P0001', message = '__ACEITE_FICHA_DESFAZER__';
  exception when others then
    if sqlerrm = '__ACEITE_FICHA_DESFAZER__' then
      return 'ACEITE FICHA OK';
    end if;
    raise;
  end;
end $$;

select private.aceite_ficha() as resultado;
