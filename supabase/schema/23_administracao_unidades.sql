-- =====================================================================
-- PetCare Hub · 23 · Administração: controle unitário e fracionado
-- Decisões de 22/11/2026 (chat "Administração · estoque e compras"):
--   • A unidade de controle é como o produto é CONTADO.
--     - Unitário (padrão): o produto entra e sai inteiro. O estoque é em
--       unidades inteiras e a unidade tem nome (unidade_rotulo). Embalagem
--       maior é múltiplo inteiro dela: uma embalagem com 30 gera 30 unidades.
--     - Fracionado: só para o que é controlado por medida (litro, quilo,
--       metro). Guardado em ml, g e cm (inteiros); a tela mostra L, kg e m.
--   • Toda quantidade na unidade de controle é inteira: saldo, mínimo,
--     movimento, contagem e fator de embalagem. Fração de unidade não existe
--     no estoque, então não gera diferença de inventário.
--   • Embalagem nunca é menor que a unidade de controle (fator inteiro ≥ 1).
--   • Produto unitário só aceita quantidade inteira de embalagem nos
--     documentos (requisição, transferência, pedido, recebimento).
--   • Envio de requisição e confirmação de transferência sem quantidade
--     informada mandam só embalagens inteiras do que houver no local.
--
-- Rode depois do 22. Idempotente. Não há produtos em produção: as regras
-- novas valem desde o primeiro cadastro.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Nome da unidade de controle (só no unitário)
-- ---------------------------------------------------------------------
alter table public.produtos add column if not exists unidade_rotulo text;
alter table public.produtos drop constraint if exists produtos_unidade_rotulo_check;
alter table public.produtos add constraint produtos_unidade_rotulo_check
  check ((unidade_base = 'un' or unidade_rotulo is null)
     and (unidade_rotulo is null or length(trim(unidade_rotulo)) > 0));

-- A embalagem base leva o nome da unidade (fator 1). Mudou o nome, muda a base.
create or replace function private.produtos_depois() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.produto_custos (produto_id, petshop_id) values (new.id, new.petshop_id)
    on conflict do nothing;
    insert into public.produto_unidades (petshop_id, produto_id, rotulo, fator, eh_base)
    values (new.petshop_id, new.id, coalesce(trim(new.unidade_rotulo), new.unidade_base), 1, true)
    on conflict do nothing;
  elsif new.unidade_rotulo is distinct from old.unidade_rotulo then
    update public.produto_unidades
       set rotulo = coalesce(trim(new.unidade_rotulo), new.unidade_base)
     where produto_id = new.id and eh_base;
  end if;
  return null;
end $$;
drop trigger if exists produtos_depois on public.produtos;
create trigger produtos_depois after insert or update of unidade_rotulo on public.produtos
  for each row execute function private.produtos_depois();

-- ---------------------------------------------------------------------
-- 2. Quantidades inteiras na unidade de controle
-- ---------------------------------------------------------------------
alter table public.produto_unidades drop constraint if exists produto_unidades_fator_inteiro;
alter table public.produto_unidades add constraint produto_unidades_fator_inteiro
  check (fator >= 1 and fator = trunc(fator));

alter table public.estoque_saldos drop constraint if exists estoque_saldos_inteiro;
alter table public.estoque_saldos add constraint estoque_saldos_inteiro
  check (quantidade = trunc(quantidade) and (minimo is null or minimo = trunc(minimo)));

alter table public.estoque_movimentos drop constraint if exists estoque_movimentos_inteiro;
alter table public.estoque_movimentos add constraint estoque_movimentos_inteiro
  check (quantidade = trunc(quantidade) and saldo_apos = trunc(saldo_apos));

alter table public.inventario_itens drop constraint if exists inventario_itens_inteiro;
alter table public.inventario_itens add constraint inventario_itens_inteiro
  check ((qtd_contada is null or qtd_contada = trunc(qtd_contada))
     and (saldo_sistema is null or saldo_sistema = trunc(saldo_sistema))
     and (ajuste is null or ajuste = trunc(ajuste)));

-- Itens de documento: a quantidade × fator fecha na unidade de controle;
-- no unitário, a quantidade de embalagem também é inteira.
-- Nome com "zz_" para rodar depois das triggers que preenchem produto e fator.
create or replace function private.itens_validar_quantidade() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j jsonb := to_jsonb(new);
  v_base text;
  v_nome text;
  v_fator numeric := (to_jsonb(new) ->> 'fator')::numeric;
  c text;
  q numeric;
begin
  select p.unidade_base, p.nome into v_base, v_nome from public.produtos p where p.id = new.produto_id;
  foreach c in array case tg_table_name
      when 'requisicao_itens'    then array['qtd_solicitada','qtd_atendida']
      when 'transferencia_itens' then array['qtd_solicitada','qtd_movida']
      when 'pedido_compra_itens' then array['qtd_pedida','qtd_recebida']
      when 'recebimento_itens'   then array['quantidade']
      else array[]::text[] end
  loop
    q := (j ->> c)::numeric;
    continue when q is null;
    if v_base = 'un' and q <> trunc(q) then
      raise exception '"%" é controlado por unidade: use quantidade inteira', v_nome using errcode = '23514';
    end if;
    if q * v_fator <> trunc(q * v_fator) then
      raise exception 'A quantidade de "%" não fecha em % inteiros', v_nome, v_base using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['requisicao_itens','transferencia_itens','pedido_compra_itens','recebimento_itens'] loop
    execute format('drop trigger if exists zz_quantidade on public.%I', t);
    execute format('create trigger zz_quantidade before insert or update on public.%I
                    for each row execute function private.itens_validar_quantidade()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Envio e confirmação sem quantidade informada: só embalagens inteiras
--    (mesmas funções do 22; muda só o cálculo do padrão e do limite)
-- ---------------------------------------------------------------------

create or replace function public.requisicao_atender(p_requisicao uuid, p_itens jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.requisicoes;
  i public.requisicao_itens;
  v_saldo numeric;
  v_max numeric;
  v_qtd numeric;
  v_inf numeric;
  v_parcial boolean := false;
  v_res jsonb := '[]'::jsonb;
begin
  select * into r from public.requisicoes where id = p_requisicao for update;
  if r.id is null then raise exception 'Requisição não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(r.petshop_id, private.papeis_estoque());
  perform private.exigir_funcionalidade(r.petshop_id, 'administracao.almoxarifado');
  if r.tipo <> 'consumo' or r.status <> 'pendente' then
    raise exception 'Só requisição de consumo pendente pode ser atendida (status: %)', r.status using errcode = '23514';
  end if;

  for i in select * from public.requisicao_itens where requisicao_id = r.id order by id loop
    v_saldo := private.saldo(i.produto_id, r.local_id);
    v_max := v_saldo / i.fator;            -- limite exato (quantidade informada)
    v_inf := (select (x ->> 'quantidade')::numeric from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
               where (x ->> 'item_id')::uuid = i.id limit 1);
    if v_inf is not null then
      if v_inf < 0 or v_inf > i.qtd_solicitada then
        raise exception 'Quantidade enviada fora do pedido (0 a %)', i.qtd_solicitada using errcode = '23514';
      end if;
      if v_inf > v_max then
        raise exception 'Saldo insuficiente: o local tem % %', round(v_max, 4), i.unidade_rotulo using errcode = '23514';
      end if;
      v_qtd := v_inf;
    else
      v_qtd := least(i.qtd_solicitada, floor(v_max));   -- sem informar: só embalagens inteiras
    end if;
    if v_qtd > 0 then
      perform private.estoque_mover(r.petshop_id, i.produto_id, r.local_id, -(v_qtd * i.fator), 'requisicao',
                                    p_requisicao => r.id);
    end if;
    update public.requisicao_itens set qtd_atendida = v_qtd where id = i.id;
    if v_qtd < i.qtd_solicitada then v_parcial := true; end if;
    v_res := v_res || jsonb_build_object('item_id', i.id, 'produto_id', i.produto_id, 'unidade', i.unidade_rotulo,
                                         'solicitada', i.qtd_solicitada, 'atendida', v_qtd,
                                         'faltante', i.qtd_solicitada - v_qtd);
  end loop;

  update public.requisicoes
     set status = case when v_parcial then 'atendida_parcial' else 'atendida' end,
         concluido_por = auth.uid(), concluida_em = now()
   where id = r.id;
  return jsonb_build_object('requisicao_id', r.id, 'status', case when v_parcial then 'atendida_parcial' else 'atendida' end,
                            'precisa_comprar', v_parcial, 'itens', v_res);
end $$;

create or replace function public.transferencia_confirmar(p_transferencia uuid, p_itens jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.transferencias;
  i public.transferencia_itens;
  v_des public.estoque_locais;
  v_max numeric;
  v_inf numeric;
  v_qtd numeric;
  v_parcial boolean := false;
  v_res jsonb := '[]'::jsonb;
begin
  select * into t from public.transferencias where id = p_transferencia for update;
  if t.id is null then raise exception 'Transferência não encontrada' using errcode = 'P0002'; end if;
  perform private.exigir_papel(t.petshop_id, private.papeis_estoque());
  if t.status <> 'aprovada' then
    raise exception 'Só transferência aprovada pode ser confirmada (status: %)', t.status using errcode = '23514';
  end if;
  perform private.local_ativo(t.petshop_id, t.origem_id);
  v_des := private.local_ativo(t.petshop_id, t.destino_id);
  for i in select * from public.transferencia_itens where transferencia_id = t.id order by id loop
    v_max := private.saldo(i.produto_id, t.origem_id) / i.fator;   -- limite exato (quantidade informada)
    v_inf := (select (x ->> 'quantidade')::numeric from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
               where (x ->> 'item_id')::uuid = i.id limit 1);
    if v_inf is not null then
      if v_inf < 0 or v_inf > i.qtd_solicitada then
        raise exception 'Quantidade movida fora do aprovado (0 a %)', i.qtd_solicitada using errcode = '23514';
      end if;
      if v_inf > v_max then
        raise exception 'Saldo insuficiente na origem: tem % %', round(v_max, 4), i.unidade_rotulo using errcode = '23514';
      end if;
      v_qtd := v_inf;
    else
      v_qtd := least(i.qtd_solicitada, floor(v_max));   -- sem informar: só embalagens inteiras
    end if;
    if v_qtd > 0 then
      perform private.estoque_mover(t.petshop_id, i.produto_id, t.origem_id, -(v_qtd * i.fator), 'transferencia_saida',
                                    p_transferencia => t.id);
      perform private.estoque_mover(t.petshop_id, i.produto_id, t.destino_id, v_qtd * i.fator, 'transferencia_entrada',
                                    p_transferencia => t.id);
    end if;
    update public.transferencia_itens set qtd_movida = v_qtd where id = i.id;
    if v_qtd < i.qtd_solicitada then v_parcial := true; end if;
    v_res := v_res || jsonb_build_object('item_id', i.id, 'produto_id', i.produto_id, 'unidade', i.unidade_rotulo,
                                         'aprovada', i.qtd_solicitada, 'movida', v_qtd, 'faltante', i.qtd_solicitada - v_qtd);
  end loop;
  update public.transferencias set status = 'concluida', concluido_por = auth.uid(), concluida_em = now() where id = t.id;
  return jsonb_build_object('transferencia_id', t.id, 'status', 'concluida', 'parcial', v_parcial, 'itens', v_res);
end $$;

-- ---------------------------------------------------------------------
-- 4. Permissões das funções novas ou recriadas
-- ---------------------------------------------------------------------
revoke all on function private.itens_validar_quantidade() from public, anon;
revoke all on function public.requisicao_atender(uuid, jsonb) from public, anon;
grant execute on function public.requisicao_atender(uuid, jsonb) to authenticated, service_role;
revoke all on function public.transferencia_confirmar(uuid, jsonb) from public, anon;
grant execute on function public.transferencia_confirmar(uuid, jsonb) to authenticated, service_role;

select 'Arquivo 23 aplicado: controle unitário e fracionado (quantidades inteiras na unidade de controle).' as resultado;

commit;
