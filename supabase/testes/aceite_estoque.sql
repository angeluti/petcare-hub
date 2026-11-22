-- =====================================================================
-- PetCare Hub · Aceite do arquivo 22 (Administração: estoque, compras e contas)
--   E01 papéis: estoquista, papel adicional, menu, só a Harpia define adicionais
--   E02 produtos: insumo/venda, embalagem base automática e protegida
--   E03 custo visível só para dono, gerente e estoquista
--   E04 pedido de compra: rascunho protegido, envio, recebimento parcial e
--       total, parcelas, custo médio ponderado, contas a pagar
--   E05 requisição: profissional pede, estoquista envia; falta vira parcial;
--       estoque nunca negativo; aviso de falta
--   E06 devolução: limite do enviado, aprovação do dono, entrada só na
--       confirmação física, pelo custo da saída original
--   E07 locais e transferência: vários locais por funcionalidade, aprovação,
--       estoque só se move na confirmação física, mínimo por local com aviso
--   E08 inventário: diferença sobre o saldo da contagem; só dono/gerente fecham
--   E09 contas a pagar manuais, baixa, reabertura, cancelamento; categorias
--   E10 contas a receber: fiado do check-out e recebimento posterior
--   E11 isolamento entre pet shops e funcionalidade desligada no Essencial
--   E12 escrita direta bloqueada no livro-razão e no saldo
--
-- Rode no SQL Editor depois do 22. Tudo é desfeito no final (nada é gravado).
-- Resultado esperado na última linha: "ACEITE ESTOQUE OK".
-- Para repetir: select * from private.aceite_estoque();
-- =====================================================================

create or replace function private.aceite_estoque() returns setof text
language plpgsql volatile as $fn$
declare
  tz      constant text := 'America/Sao_Paulo';
  pf      constant uuid := '11111111-1111-4111-8111-111111111111';   -- Pet Feliz (Profissional)
  pr      constant uuid := '22222222-2222-4222-8222-222222222222';   -- Pata Amiga Petshop (Essencial)
  ana     constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  s_banho constant uuid := 'b0000000-0000-4000-8000-000000000001';
  saida   text[] := '{}';
  ok      boolean;
  n       numeric;
  j       jsonb;
  u_pf uuid; u_pr uuid; u_est uuid; u_prof uuid;
  m_est uuid;
  v_alm uuid; v_vnd uuid; v_alm_pr uuid;
  v_sh uuid; v_sh_gal uuid; v_sh_lit uuid; v_sh_ml uuid;
  v_laco uuid; v_laco_pct uuid;
  v_forn uuid; v_ped uuid; v_pi1 uuid; v_pi2 uuid;
  v_req uuid; v_dev uuid; v_tr uuid; v_inv uuid;
  v_item uuid; v_cat uuid; v_grupo uuid; v_conta uuid;
  v_tutor uuid; v_pet uuid; v_ag uuid;
begin
  perform set_config('plpgsql.check_asserts', 'on', true);
  select id into u_pf from auth.users where email = 'petfeliz@gmail.com';
  select id into u_pr from auth.users where email = 'pataamigapetshop@outlook.com';
  begin
    assert u_pf is not null and u_pr is not null, 'FALHOU E00: usuários de teste não encontrados';

    -- Equipe de teste do Pet Feliz: recepção + estoquista (adicional) e profissional
    insert into auth.users (id, email) values (gen_random_uuid(), 'estoquista.aceite@teste.local') returning id into u_est;
    insert into auth.users (id, email) values (gen_random_uuid(), 'profissional.aceite@teste.local') returning id into u_prof;
    insert into public.petshop_membros (petshop_id, user_id, nome, papel) values (pf, u_est, 'Estoquista aceite', 'recepcao')
      returning id into m_est;
    insert into public.petshop_membros (petshop_id, user_id, nome, papel) values (pf, u_prof, 'Profissional aceite', 'profissional');
    perform public.definir_papeis_adicionais(m_est, array['estoquista']);   -- SQL Editor = Harpia
    perform private.administracao_preparar(pf);
    perform private.administracao_preparar(pr);
    select id into v_alm from public.estoque_locais where petshop_id = pf and padrao_requisicao;
    select id into v_alm_pr from public.estoque_locais where petshop_id = pr and padrao_requisicao;

    -- ---------------------------------------------------------------- E01
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert public.meus_papeis(pf) = array['estoquista','recepcao'], 'FALHOU E01: papéis efetivos ' || public.meus_papeis(pf)::text;
    assert pf in (select private.petshops_com_papel(private.papeis_estoque())), 'FALHOU E01: papel adicional ignorado na RLS';
    assert 'administracao.estoque' in (select public.minhas_funcionalidades(pf)), 'FALHOU E01: menu do estoquista';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert public.meus_papeis(pf) = array['dono'], 'FALHOU E01: dono sem adicional';
    ok := false;
    begin perform public.definir_papeis_adicionais(m_est, array['gerente']);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E01: dono definiu papel adicional';
    reset role;
    saida := saida || 'OK E01 estoquista como papel adicional (RLS, menu, papéis efetivos); só a Harpia define'::text;

    -- ---------------------------------------------------------------- E02
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.produtos (petshop_id, nome, unidade_base, usa_como_insumo, usa_como_venda)
    values (pf, 'Shampoo neutro (aceite)', 'ml', true, true) returning id into v_sh;
    insert into public.produtos (petshop_id, nome, unidade_base) values (pf, 'Laço (aceite)', 'un') returning id into v_laco;
    select id into v_sh_ml from public.produto_unidades where produto_id = v_sh and eh_base;
    assert v_sh_ml is not null, 'FALHOU E02: embalagem base não criada';
    insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator, usa_requisicao)
    values (pf, v_sh, 'Galão 5 L', 5000, false) returning id into v_sh_gal;
    insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator, usa_compra)
    values (pf, v_sh, 'Litro', 1000, false) returning id into v_sh_lit;
    insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator)
    values (pf, v_laco, 'Pacote 50', 50) returning id into v_laco_pct;
    ok := false;
    begin insert into public.produtos (petshop_id, nome, unidade_base, usa_como_insumo, usa_como_venda)
          values (pf, 'Sem uso (aceite)', 'un', false, false);
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E02: produto sem insumo nem venda aceito';
    ok := false;
    begin update public.produtos set unidade_base = 'g' where id = v_sh;
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E02: unidade base mudou';
    ok := false;
    begin update public.produto_unidades set fator = 2 where id = v_sh_ml;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E02: embalagem base alterada';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin insert into public.produtos (petshop_id, nome, unidade_base) values (pf, 'Do profissional (aceite)', 'un');
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E02: profissional cadastrou produto';
    assert (select count(*) from public.produtos where id = v_sh) = 1, 'FALHOU E02: profissional não enxerga o produto';
    reset role;
    saida := saida || 'OK E02 produtos com insumo/venda, embalagem base automática e protegida'::text;

    -- ---------------------------------------------------------------- E04 (compra antes do E03, para haver custo)
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.fornecedores (petshop_id, nome, documento) values (pf, 'Distribuidora Aceite', '00.000.000/0001-00')
      returning id into v_forn;
    insert into public.pedidos_compra (petshop_id, fornecedor_id, status) values (pf, v_forn, 'recebido')
      returning id into v_ped;
    assert (select status from public.pedidos_compra where id = v_ped) = 'rascunho', 'FALHOU E04: pedido não nasceu rascunho';
    insert into public.pedido_compra_itens (petshop_id, pedido_id, produto_id, produto_unidade_id, unidade_rotulo, fator, qtd_pedida, custo_previsto)
    values (pf, v_ped, v_laco, v_sh_gal, 'x', 1, 4, 80) returning id into v_pi1;     -- produto e fator corrigidos pela embalagem
    assert (select produto_id = v_sh and fator = 5000 and unidade_rotulo = 'Galão 5 L' from public.pedido_compra_itens where id = v_pi1),
           'FALHOU E04: item não copiou produto e fator da embalagem';
    insert into public.pedido_compra_itens (petshop_id, pedido_id, produto_id, produto_unidade_id, unidade_rotulo, fator, qtd_pedida, custo_previsto)
    values (pf, v_ped, v_laco, v_laco_pct, '', 1, 2, 30) returning id into v_pi2;
    ok := false;
    begin update public.pedidos_compra set status = 'enviado' where id = v_ped;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E04: status mudou fora da ação';
    perform public.pedido_compra_enviar(v_ped);
    ok := false;
    begin update public.pedido_compra_itens set qtd_pedida = 10 where id = v_pi1;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E04: item alterado depois do envio';
    -- 1º recebimento: 2 galões a R$ 80 + 1 pacote a R$ 30 = R$ 190, em duas parcelas
    ok := false;
    begin perform public.compra_receber(pf, jsonb_build_array(
            jsonb_build_object('pedido_item_id', v_pi1, 'quantidade', 2),
            jsonb_build_object('pedido_item_id', v_pi2, 'quantidade', 1)),
          p_pedido => v_ped, p_parcelas => '[{"vencimento":"2030-01-10","valor":100},{"vencimento":"2030-02-10","valor":100}]');
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E04: parcelas que não somam o total aceitas';
    j := public.compra_receber(pf, jsonb_build_array(
            jsonb_build_object('pedido_item_id', v_pi1, 'quantidade', 2),
            jsonb_build_object('pedido_item_id', v_pi2, 'quantidade', 1)),
          p_pedido => v_ped, p_nf => '123',
          p_parcelas => '[{"vencimento":"2030-01-10","valor":95},{"vencimento":"2030-02-10","valor":95}]');
    assert j ->> 'pedido_status' = 'recebido_parcial' and (j ->> 'valor_total')::numeric = 190
       and jsonb_array_length(j -> 'contas_pagar') = 2, 'FALHOU E04: 1º recebimento ' || j::text;
    ok := false;
    begin perform public.compra_receber(pf, jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi1, 'quantidade', 3)), p_pedido => v_ped);
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E04: recebimento acima do pedido aceito';
    -- 2º recebimento: 2 galões a R$ 100 → custo médio (2×80 + 2×100)/4 = R$ 90/galão = R$ 0,018/ml
    j := public.compra_receber(pf, jsonb_build_array(jsonb_build_object('pedido_item_id', v_pi1, 'quantidade', 2, 'custo_unitario', 100)),
                               p_pedido => v_ped);
    assert j ->> 'pedido_status' = 'recebido_parcial', 'FALHOU E04: pedido deveria seguir parcial (faltam laços)';
    perform public.pedido_compra_encerrar(v_ped, 'Fornecedor sem laço');
    assert (select status from public.pedidos_compra where id = v_ped) = 'encerrado', 'FALHOU E04: encerrar';
    assert private.saldo(v_sh, v_alm) = 20000 and private.saldo(v_laco, v_alm) = 50, 'FALHOU E04: saldos após recebimento';
    assert (select custo_medio from public.produto_custos where produto_id = v_sh) = 0.018, 'FALHOU E04: custo médio';
    reset role;
    assert (select count(*) from public.contas_pagar where petshop_id = pf and fornecedor_id = v_forn) = 3
       and (select sum(valor) from public.contas_pagar where petshop_id = pf and fornecedor_id = v_forn) = 390,
           'FALHOU E04: contas a pagar geradas';
    saida := saida || 'OK E04 pedido de compra: rascunho protegido, recebimento parcial, parcelas, custo médio, contas a pagar'::text;

    -- ---------------------------------------------------------------- E03
    perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select count(*) from public.produto_custos where produto_id = v_sh) = 0, 'FALHOU E03: profissional vê custo médio';
    assert (select count(*) from public.estoque_movimentos where produto_id = v_sh) = 0, 'FALHOU E03: profissional vê movimentos';
    assert (select count(*) from public.pedidos_compra where id = v_ped) = 0, 'FALHOU E03: profissional vê compras';
    assert (select count(*) from public.contas_pagar) = 0, 'FALHOU E03: profissional vê contas a pagar';
    assert (select quantidade from public.estoque_saldos where produto_id = v_sh and local_id = v_alm) = 20000,
           'FALHOU E03: profissional não vê o saldo';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select count(*) from public.produto_custos where produto_id = v_sh) = 1, 'FALHOU E03: estoquista não vê custo';
    assert (select count(*) from public.contas_pagar) = 0, 'FALHOU E03: estoquista vê contas a pagar';
    reset role;
    saida := saida || 'OK E03 custo só para dono, gerente e estoquista; saldo para todos; financeiro só dono e gerente'::text;

    -- ---------------------------------------------------------------- E05
    perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.requisicao_criar(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_sh_gal, 'quantidade', 1)));
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E05: embalagem sem uso em requisição aceita';
    v_req := public.requisicao_criar(pf, jsonb_build_array(
               jsonb_build_object('produto_unidade_id', v_sh_lit, 'quantidade', 2),
               jsonb_build_object('produto_unidade_id', v_laco_pct, 'quantidade', 3)), null, ana, 'Bancada da Ana');
    assert (select status from public.requisicoes where id = v_req) = 'pendente', 'FALHOU E05: requisição não nasceu pendente';
    assert private.saldo(v_sh, v_alm) = 20000, 'FALHOU E05: baixa antes do envio';
    ok := false;
    begin perform public.requisicao_atender(v_req);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E05: profissional atendeu requisição';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.requisicao_atender(v_req, jsonb_build_array(
            jsonb_build_object('item_id', (select id from public.requisicao_itens where requisicao_id = v_req and produto_id = v_laco), 'quantidade', 3)));
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E05: envio acima do saldo aceito';
    j := public.requisicao_atender(v_req);    -- tem 1 pacote de laço (50 un), pediram 3
    assert j ->> 'status' = 'atendida_parcial' and (j ->> 'precisa_comprar')::boolean, 'FALHOU E05: deveria ser parcial ' || j::text;
    assert private.saldo(v_sh, v_alm) = 18000 and private.saldo(v_laco, v_alm) = 0, 'FALHOU E05: saldos após envio';
    assert (select custo_unitario from public.estoque_movimentos where requisicao_id = v_req and produto_id = v_sh) = 0.018,
           'FALHOU E05: saída fora do custo médio';
    assert exists (select 1 from public.estoque_avisos(pf) a where a.tipo = 'falta_requisicao' and a.referencia = v_req
                                                            and a.produto_id = v_laco and a.faltante = 100),
           'FALHOU E05: aviso de falta';
    reset role;
    saida := saida || 'OK E05 requisição: baixa no envio, parcial quando falta, nunca negativo, aviso de compra'::text;

    -- ---------------------------------------------------------------- E06
    select id into v_item from public.requisicao_itens where requisicao_id = v_req and produto_id = v_sh;
    perform set_config('request.jwt.claims', '', true);   -- SQL Editor
    -- custo sobe antes da devolução: 1 galão a R$ 150 (a devolução tem de voltar a R$ 0,018/ml)
    perform public.compra_receber(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_sh_gal, 'quantidade', 1, 'custo_unitario', 150)));
    perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.devolucao_criar(v_req, jsonb_build_array(jsonb_build_object('item_origem_id', v_item, 'quantidade', 3)));
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E06: devolução acima do enviado aceita';
    v_dev := public.devolucao_criar(v_req, jsonb_build_array(jsonb_build_object('item_origem_id', v_item, 'quantidade', 1)), 'Frasco fechado');
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.devolucao_aprovar(v_dev);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E06: estoquista aprovou devolução';
    ok := false;
    begin perform public.devolucao_receber(v_dev);
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E06: recebeu devolução sem aprovação';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.devolucao_aprovar(v_dev);
    reset role;
    assert private.saldo(v_sh, v_alm) = 23000, 'FALHOU E06: aprovação mexeu no estoque';
    n := (select custo_medio from public.produto_custos where produto_id = v_sh);
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.devolucao_receber(v_dev);
    reset role;
    assert private.saldo(v_sh, v_alm) = 24000, 'FALHOU E06: devolução não entrou';
    assert (select custo_unitario from public.estoque_movimentos where requisicao_id = v_dev) = 0.018,
           'FALHOU E06: devolução fora do custo da saída';
    assert (select custo_medio from public.produto_custos where produto_id = v_sh)
           = round((23000 * n + 1000 * 0.018) / 24000, 6), 'FALHOU E06: custo médio após devolução';
    saida := saida || 'OK E06 devolução: limite do enviado, aprovação do dono, entra na confirmação pelo custo da saída'::text;

    -- ---------------------------------------------------------------- E07
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.estoque_locais (petshop_id, nome, tipo) values (pf, 'Prateleira de venda (aceite)', 'venda') returning id into v_vnd;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.transferencia_criar(pf, v_alm, v_vnd, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_laco_pct, 'quantidade', 1)));
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E07: produto que não é de venda foi para a prateleira';
    v_tr := public.transferencia_criar(pf, v_alm, v_vnd, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_sh_lit, 'quantidade', 5)));
    assert (select status from public.transferencias where id = v_tr) = 'solicitada', 'FALHOU E07: pedida pelo profissional deveria esperar aprovação';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.transferencia_confirmar(v_tr);
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E07: confirmou sem aprovação';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.transferencia_decidir(v_tr, true);
    reset role;
    assert private.saldo(v_sh, v_alm) = 24000 and private.saldo(v_sh, v_vnd) = 0, 'FALHOU E07: aprovação moveu estoque';
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    j := public.transferencia_confirmar(v_tr, jsonb_build_array(
           jsonb_build_object('item_id', (select id from public.transferencia_itens where transferencia_id = v_tr), 'quantidade', 4)));
    assert (j ->> 'parcial')::boolean, 'FALHOU E07: confirmação parcial';
    reset role;
    assert private.saldo(v_sh, v_alm) = 20000 and private.saldo(v_sh, v_vnd) = 4000, 'FALHOU E07: saldos após transferência';
    -- Mínimo por local: almoxarifado no mínimo → aviso, com a prateleira como cobertura
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.estoque_definir_minimo(v_sh, v_alm, 20000);
    assert exists (select 1 from public.estoque_avisos(pf) a
                    where a.tipo = 'abaixo_minimo' and a.produto_id = v_sh and a.local_id = v_alm
                      and (a.cobertura -> 0 ->> 'local_id')::uuid = v_vnd), 'FALHOU E07: aviso de mínimo com cobertura';
    reset role;
    -- Dono pede: nasce aprovada, mas ainda precisa da confirmação física
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_tr := public.transferencia_criar(pf, v_vnd, v_alm, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_sh_lit, 'quantidade', 1)));
    assert (select status from public.transferencias where id = v_tr) = 'aprovada', 'FALHOU E07: pedida pelo dono deveria nascer aprovada';
    assert private.saldo(v_sh, v_vnd) = 4000, 'FALHOU E07: transferência do dono moveu sem confirmação';
    perform public.transferencia_cancelar(v_tr, 'Teste');
    reset role;
    -- Essencial: um local só
    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin insert into public.estoque_locais (petshop_id, nome) values (pr, 'Segundo local (aceite)');
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E07: Essencial criou segundo local';
    reset role;
    saida := saida || 'OK E07 locais e transferência: aprovação, confirmação física, mínimo por local com cobertura'::text;

    -- ---------------------------------------------------------------- E08
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_inv := public.inventario_abrir(pf, v_alm, array[v_sh]);
    perform public.inventario_contar(v_inv, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_sh_lit, 'quantidade', 19),
                                                              jsonb_build_object('produto_unidade_id', v_sh_ml, 'quantidade', 500)));
    reset role;
    -- Depois da contagem (sistema 20.000; contado 19.500), sai 1 L numa requisição
    perform set_config('request.jwt.claims', json_build_object('sub', u_prof, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_req := public.requisicao_criar(pf, jsonb_build_array(jsonb_build_object('produto_unidade_id', v_sh_lit, 'quantidade', 1)));
    reset role;
    perform set_config('request.jwt.claims', '', true);   -- SQL Editor
    perform public.requisicao_atender(v_req);
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.inventario_fechar(v_inv);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E08: estoquista fechou inventário';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    j := public.inventario_fechar(v_inv);
    reset role;
    assert private.saldo(v_sh, v_alm) = 18500, 'FALHOU E08: saldo após inventário ' || private.saldo(v_sh, v_alm);
    assert (select ajuste from public.inventario_itens where inventario_id = v_inv and produto_id = v_sh) = -500,
           'FALHOU E08: ajuste';
    saida := saida || 'OK E08 inventário: ajuste pela diferença da contagem, só dono/gerente fecham'::text;

    -- ---------------------------------------------------------------- E09
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select id into v_cat from public.financeiro_categorias where petshop_id = pf and nome = 'Aluguel';
    v_grupo := public.conta_lancar(pf, 'pagar', 'Aluguel do salão', v_cat,
                                   '[{"vencimento":"2030-01-05","valor":2500},{"vencimento":"2030-02-05","valor":2500}]');
    select id into v_conta from public.contas_pagar where grupo_id = v_grupo and parcela = 1;
    perform public.conta_baixar('pagar', v_conta, 'pix', date '2030-01-05');
    assert (select status = 'paga' and valor_pago = 2500 from public.contas_pagar where id = v_conta), 'FALHOU E09: baixa';
    perform public.conta_reabrir('pagar', v_conta);
    perform public.conta_cancelar('pagar', v_conta, 'Lançado em duplicidade');
    assert (select status from public.contas_pagar where id = v_conta) = 'cancelada', 'FALHOU E09: cancelamento';
    ok := false;
    begin perform public.conta_editar('pagar', (select id from public.contas_pagar where petshop_id = pf and recebimento_id is not null limit 1),
                                      p_valor => 1);
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E09: valor de conta de compra alterado';
    ok := false;
    begin delete from public.financeiro_categorias where petshop_id = pf and codigo = 'compras';
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E09: categoria de sistema apagada';
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', u_est, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin perform public.conta_lancar(pf, 'pagar', 'Tentativa', v_cat, '[{"vencimento":"2030-01-05","valor":1}]');
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E09: estoquista lançou conta';
    reset role;
    saida := saida || 'OK E09 contas a pagar manuais em parcelas, baixa, reabertura, cancelamento; categorias de sistema'::text;

    -- ---------------------------------------------------------------- E10
    perform set_config('request.jwt.claims', '', true);   -- SQL Editor monta o atendimento
    v_tutor := public.cadastrar_tutor(pf, '(19) 97777-0010', 'Tutor Fiado Aceite');
    v_pet   := public.cadastrar_pet(pf, v_tutor, 'Fiadinho', 'M');
    v_ag := (public.reservar_agendamento(pf, v_pet, v_tutor, array[s_banho],
              ((current_date + 400 + (8 - extract(isodow from current_date + 400))::int % 7) + time '10:00') at time zone tz, ana)).id;
    update public.agendamentos set status = 'em_atendimento' where id = v_ag;
    perform public.fazer_checkout(v_ag, '[]'::jsonb, true);
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select saldo into n from public.contas_receber_abertas(pf) where origem = 'agendamento' and id = v_ag;
    assert n > 0, 'FALHOU E10: fiado não aparece nas contas a receber';
    ok := false;
    begin perform public.receber_agendamento(v_ag, 'pix', n + 1);
    exception when check_violation then ok := true; end;
    assert ok, 'FALHOU E10: recebeu acima do saldo';
    perform public.receber_agendamento(v_ag, 'pix', 10);
    assert (select pagamento_status from public.agendamentos where id = v_ag) = 'parcial', 'FALHOU E10: parcial';
    perform public.receber_agendamento(v_ag, 'dinheiro', n - 10);
    assert (select pagamento_status from public.agendamentos where id = v_ag) = 'pago', 'FALHOU E10: pago';
    assert not exists (select 1 from public.contas_receber_abertas(pf) where id = v_ag), 'FALHOU E10: pago continua em aberto';
    select id into v_cat from public.financeiro_categorias where petshop_id = pf and codigo = 'servicos';
    perform public.conta_lancar(pf, 'receber', 'Pacote 4 banhos (aceite)', v_cat,
                                '[{"vencimento":"2030-01-10","valor":120},{"vencimento":"2030-02-10","valor":120}]', p_tutor => v_tutor);
    assert (select count(*) from public.contas_receber_abertas(pf) where origem = 'manual' and tutor_id = v_tutor) = 2,
           'FALHOU E10: conta a receber manual';
    reset role;
    saida := saida || 'OK E10 contas a receber: fiado do check-out, recebimento parcial e total, lançamento manual'::text;

    -- ---------------------------------------------------------------- E11
    perform set_config('request.jwt.claims', json_build_object('sub', u_pr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select count(*) from public.produtos where petshop_id = pf) = 0
       and (select count(*) from public.estoque_saldos where petshop_id = pf) = 0
       and (select count(*) from public.requisicoes where petshop_id = pf) = 0, 'FALHOU E11: Pata Amiga vê o estoque do Pet Feliz';
    ok := false;
    begin perform public.requisicao_criar(pr, '[]'::jsonb);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E11: requisição no Essencial (almoxarifado desligado)';
    ok := false;
    begin perform public.requisicao_cancelar(v_req, 'invasão');
    exception when insufficient_privilege then ok := true; when check_violation then ok := true; end;
    assert ok, 'FALHOU E11: Pata Amiga mexeu em requisição do Pet Feliz';
    assert (select count(*) from public.contas_receber_abertas(pr)) >= 0, 'FALHOU E11: contas a receber no Essencial';
    reset role;
    saida := saida || 'OK E11 isolamento entre pet shops; Essencial sem estoque e com contas a receber'::text;

    -- ---------------------------------------------------------------- E12
    perform set_config('request.jwt.claims', json_build_object('sub', u_pf, 'role', 'authenticated')::text, true);
    set local role authenticated;
    ok := false;
    begin update public.estoque_saldos set quantidade = 999999 where produto_id = v_sh;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E12: dono editou o saldo';
    ok := false;
    begin insert into public.estoque_movimentos (petshop_id, produto_id, local_id, tipo, quantidade, custo_unitario, saldo_apos, inventario_id)
          values (pf, v_sh, v_alm, 'ajuste_inventario', 1, 0, 1, v_inv);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E12: dono gravou no livro-razão';
    ok := false;
    begin update public.produto_custos set custo_medio = 0 where produto_id = v_sh;
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E12: dono editou o custo médio';
    ok := false;
    begin perform private.estoque_mover(pf, v_sh, v_alm, -1, 'requisicao', p_requisicao => v_req);
    exception when insufficient_privilege then ok := true; end;
    assert ok, 'FALHOU E12: painel chamou a função interna de movimento';
    reset role;
    assert not exists (select 1 from public.estoque_saldos where quantidade < 0), 'FALHOU E12: saldo negativo';
    assert (select sum(quantidade) from public.estoque_movimentos where produto_id = v_sh)
           = (select sum(quantidade) from public.estoque_saldos where produto_id = v_sh), 'FALHOU E12: saldo ≠ livro-razão';
    saida := saida || 'OK E12 livro-razão e saldo só pelo banco; saldo = soma dos movimentos; nunca negativo'::text;

    raise exception 'FIM_DO_ACEITE';
  exception
    when assert_failure then saida := saida || sqlerrm;
    when others then
      if sqlerrm = 'FIM_DO_ACEITE' then saida := saida || 'ACEITE ESTOQUE OK ✅ (nada foi gravado)'::text;
      else saida := saida || ('ERRO inesperado: ' || sqlerrm || ' [' || sqlstate || ']'); end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return query select unnest(saida);
end $fn$;

revoke all on function private.aceite_estoque() from public, anon, authenticated;

select * from private.aceite_estoque() as resultado;
-- Para remover depois da POC: drop function private.aceite_estoque();
