-- =====================================================================
-- PetCare Hub · Aceite do arquivo 23 (controle unitário e fracionado)
--   U01 unitário: nome da unidade vira a embalagem base e acompanha a troca
--   U02 nome de unidade só no unitário
--   U03 embalagem: fator inteiro e nunca menor que a unidade de controle
--   U04 embalagem com N unidades gera N unidades no estoque
--   U05 unitário: quantidade de embalagem inteira em requisição e recebimento
--   U06 envio sem quantidade informada: só embalagens inteiras
--   U07 fracionado: fração de embalagem aceita quando fecha na unidade de controle
--   U08 mínimo e contagem inteiros na unidade de controle
-- Roda como o SQL Editor (Harpia) no Pet Feliz. Tudo é desfeito no final.
-- Resultado esperado na última linha: "ACEITE UNIDADES OK".
-- Para repetir: select * from private.aceite_unidades();
-- =====================================================================

create or replace function private.aceite_unidades() returns setof text
language plpgsql volatile as $fn$
declare
  pf  constant uuid := '11111111-1111-4111-8111-111111111111';   -- Pet Feliz (Profissional)
  saida text[] := '{}';
  ok boolean;
  j jsonb;
  v_alm uuid;
  v_un uuid; v_un_base uuid; v_un_emb uuid;
  v_fr uuid; v_fr_l uuid;
  v_req uuid; v_inv uuid;
begin
  perform set_config('plpgsql.check_asserts', 'on', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform private.administracao_preparar(pf);
    select id into v_alm from public.estoque_locais where petshop_id = pf and padrao_requisicao;

    -- ---------------------------------------------------------------- U01
    insert into public.produtos (petshop_id, nome, unidade_base, unidade_rotulo)
    values (pf, 'Produto unitário (aceite U)', 'un', 'Unidade aceite') returning id into v_un;
    select id into v_un_base from public.produto_unidades where produto_id = v_un and eh_base;
    assert (select rotulo from public.produto_unidades where id = v_un_base) = 'Unidade aceite', 'FALHOU U01: base sem o nome da unidade';
    update public.produtos set unidade_rotulo = 'Unidade aceite 2' where id = v_un;
    assert (select rotulo from public.produto_unidades where id = v_un_base) = 'Unidade aceite 2', 'FALHOU U01: base não acompanhou o nome';
    saida := saida || 'OK U01 unitário: nome da unidade vira a embalagem base e acompanha a troca'::text;

    -- ---------------------------------------------------------------- U02
    ok := false;
    begin insert into public.produtos (petshop_id, nome, unidade_base, unidade_rotulo) values (pf, 'Fracionado com nome (aceite U)', 'ml', 'x');
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU U02: fracionado aceitou nome de unidade';
    saida := saida || 'OK U02 nome de unidade só no unitário'::text;

    -- ---------------------------------------------------------------- U03
    ok := false;
    begin insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator) values (pf, v_un, 'Fator quebrado (aceite)', 2.5);
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU U03: fator fracionado aceito';
    ok := false;
    begin insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator) values (pf, v_un, 'Menor que a unidade (aceite)', 0.5);
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU U03: embalagem menor que a unidade aceita';
    insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator) values (pf, v_un, 'Embalagem 30 (aceite)', 30)
      returning id into v_un_emb;
    saida := saida || 'OK U03 embalagem: fator inteiro e nunca menor que a unidade de controle'::text;

    -- ---------------------------------------------------------------- U04
    perform public.compra_receber(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_un_emb, 'quantidade', 2, 'custo_unitario', 300)));
    assert private.saldo(v_un, v_alm) = 60, 'FALHOU U04: 2 embalagens de 30 deveriam gerar 60 unidades';
    assert (select custo_medio from public.produto_custos where produto_id = v_un) = 10, 'FALHOU U04: custo por unidade';
    saida := saida || 'OK U04 embalagem com 30 unidades gera 30 unidades no estoque, custo por unidade'::text;

    -- ---------------------------------------------------------------- U05
    ok := false;
    begin perform public.compra_receber(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_un_emb, 'quantidade', 0.5, 'custo_unitario', 150)));
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU U05: recebimento de meia embalagem aceito no unitário';
    ok := false;
    begin perform public.requisicao_criar(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_un_base, 'quantidade', 1.5)));
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU U05: requisição de 1,5 unidade aceita';
    saida := saida || 'OK U05 unitário: quantidade inteira em requisição e recebimento'::text;

    -- ---------------------------------------------------------------- U06
    perform public.requisicao_atender(public.requisicao_criar(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_un_base, 'quantidade', 2))));
    assert private.saldo(v_un, v_alm) = 58, 'FALHOU U06: saída de 2 unidades';
    v_req := public.requisicao_criar(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_un_emb, 'quantidade', 3)));
    j := public.requisicao_atender(v_req);
    assert j ->> 'status' = 'atendida_parcial' and (j -> 'itens' -> 0 ->> 'atendida')::numeric = 1,
           'FALHOU U06: com 58 unidades deveria enviar 1 embalagem de 30 ' || j::text;
    assert private.saldo(v_un, v_alm) = 28, 'FALHOU U06: saldo após envio parcial';
    saida := saida || 'OK U06 envio sem quantidade informada: só embalagens inteiras'::text;

    -- ---------------------------------------------------------------- U07
    insert into public.produtos (petshop_id, nome, unidade_base) values (pf, 'Produto fracionado (aceite U)', 'ml') returning id into v_fr;
    insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator) values (pf, v_fr, 'Litro (aceite)', 1000) returning id into v_fr_l;
    perform public.compra_receber(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_fr_l, 'quantidade', 5, 'custo_unitario', 20)));
    v_req := public.requisicao_criar(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_fr_l, 'quantidade', 1.5)));
    perform public.requisicao_atender(v_req);
    assert private.saldo(v_fr, v_alm) = 3500, 'FALHOU U07: 1,5 L deveria sair como 1.500 ml';
    ok := false;
    begin perform public.requisicao_criar(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_fr_l, 'quantidade', 0.0005)));
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU U07: quantidade abaixo de 1 ml aceita';
    -- Sem quantidade informada: pede 4 L, tem 3,5 L → envia 3 L
    v_req := public.requisicao_criar(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_fr_l, 'quantidade', 4)));
    j := public.requisicao_atender(v_req);
    assert (j -> 'itens' -> 0 ->> 'atendida')::numeric = 3 and private.saldo(v_fr, v_alm) = 500, 'FALHOU U07: envio padrão ' || j::text;
    saida := saida || 'OK U07 fracionado: fração de embalagem aceita quando fecha em ml; padrão envia embalagens inteiras'::text;

    -- ---------------------------------------------------------------- U08
    ok := false;
    begin perform public.estoque_definir_minimo(v_un, v_alm, 2.5);
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU U08: mínimo fracionado aceito';
    perform public.estoque_definir_minimo(v_un, v_alm, 30);
    v_inv := public.inventario_abrir(pf, v_alm, array[v_un]);
    ok := false;
    begin perform public.inventario_contar(v_inv, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_un_base, 'quantidade', 27.5)));
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU U08: contagem fracionada aceita';
    perform public.inventario_contar(v_inv, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_un_base, 'quantidade', 27)));
    perform public.inventario_fechar(v_inv);
    assert private.saldo(v_un, v_alm) = 27, 'FALHOU U08: ajuste do inventário';
    saida := saida || 'OK U08 mínimo e contagem inteiros na unidade de controle'::text;

    raise exception 'FIM_DO_ACEITE';
  exception
    when assert_failure then saida := saida || sqlerrm;
    when others then
      if sqlerrm = 'FIM_DO_ACEITE' then saida := saida || 'ACEITE UNIDADES OK ✅ (nada foi gravado)'::text;
      else saida := saida || ('ERRO inesperado: ' || sqlerrm || ' [' || sqlstate || ']'); end if;
  end;
  return query select unnest(saida);
end $fn$;

revoke all on function private.aceite_unidades() from public, anon, authenticated;

select * from private.aceite_unidades() as resultado;
-- Para remover depois da POC: drop function private.aceite_unidades();
