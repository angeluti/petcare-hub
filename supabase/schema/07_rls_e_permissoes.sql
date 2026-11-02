-- =====================================================================
-- PetCare Hub · 07 · Permissões e RLS por usuário logado
-- Substitui as políticas antigas *_by_petshop (current_setting).
-- Modelo:
--   anon           → nada nas tabelas; só a RPC ficha_publica
--   authenticated  → RLS: vê o que os pet shops dele permitem pelo papel
--   service_role   → N8n (secret key); ignora RLS; únicas RPCs do bot
--   super_admin    → papel em harpia_equipe; vê e edita tudo pelo painel admin.
-- Papéis do cliente hoje: dono (MVP). gerente/recepção/profissional (F2)
-- já têm lugar nas funções private.papeis_*().
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. GRANTs (evita o 42501 que apareceu antes com o service_role)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- RPCs exclusivas do N8n
revoke execute on function public.bot_entrada(uuid, text)                          from authenticated;
revoke execute on function public.bot_salvar_estado(uuid, text, jsonb)             from authenticated;
revoke execute on function public.bot_pausar_por_humano(uuid, text)                from authenticated;
revoke execute on function public.bot_cadastrar_tutor(uuid, text, text)            from authenticated;
revoke execute on function public.bot_vincular_pet_compartilhado(uuid, uuid, uuid) from authenticated;
revoke execute on function public.bot_agendamentos_tutor(uuid, uuid)               from authenticated;
revoke execute on function public.bot_cancelar(uuid, uuid, uuid)                   from authenticated;
revoke execute on function public.lembretes_pendentes(uuid)                        from authenticated;
revoke execute on function public.bot_token(uuid)                                  from authenticated;
revoke execute on function public.bot_petshop_por_instancia(text, text)            from authenticated;

-- Única porta pública
grant execute on function public.ficha_publica(text) to anon;

-- Tabelas e funções criadas no futuro não nascem abertas para o anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;

-- ---------------------------------------------------------------------
-- 2. Liga RLS em todas as tabelas do schema public
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Tabelas do tenant (têm petshop_id): políticas geradas por perfil
--    ler / escrever (insert+update) / apagar ∈ membro|operacao|config|financeiro|super|nenhum
-- ---------------------------------------------------------------------
create or replace function private.expr_acesso(p_nivel text) returns text
language sql immutable set search_path = '' as $$
  select case p_nivel
    when 'membro'     then '(select private.eh_super_admin()) or petshop_id in (select private.meus_petshops())'
    when 'operacao'   then '(select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao()))'
    when 'config'     then '(select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_config()))'
    when 'financeiro' then '(select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_financeiro()))'
    when 'super'      then '(select private.eh_super_admin())'
    else null end;
$$;

do $$
declare
  r record;
  e_ler text; e_esc text; e_del text;
begin
  for r in select * from (values
      -- tabela                    ler          escrever      apagar
      ('servicos',                 'membro',    'config',     'config'),
      ('servico_precos',           'membro',    'config',     'config'),
      ('recursos',                 'membro',    'config',     'config'),
      ('recurso_servicos',         'membro',    'config',     'config'),
      ('horarios_funcionamento',   'membro',    'config',     'config'),
      ('recurso_horarios',         'membro',    'config',     'config'),
      ('bloqueios',                'membro',    'config',     'config'),
      ('agendamentos',             'membro',    'operacao',   'config'),
      ('agendamento_itens',        'membro',    'operacao',   'operacao'),
      ('pagamentos',               'membro',    'operacao',   'config'),
      ('lembretes',                'membro',    'super',      'super'),
      ('bot_config',               'membro',    'config',     'super'),
      ('bot_conversas',            'membro',    'operacao',   'super'),
      ('mensagens_log',            'membro',    'super',      'super'),
      ('petshop_funcionalidades',  'membro',    'super',      'super'),
      ('petshop_custos_config',    'financeiro','financeiro', 'financeiro'),
      ('taxas_pagamento',          'financeiro','financeiro', 'financeiro'),
      ('custos_mensais',           'financeiro','financeiro', 'financeiro'),
      ('recurso_custos',           'financeiro','financeiro', 'financeiro'),
      ('fornecedores',             'membro',    'config',     'config'),
      ('insumos',                  'membro',    'config',     'config'),
      ('requisicoes',              'membro',    'operacao',   'config'),
      ('requisicao_itens',         'membro',    'operacao',   'super'),
      ('compras',                  'membro',    'config',     'config'),
      ('compra_itens',             'membro',    'config',     'config'),
      ('estoque_movimentos',       'membro',    'config',     'nenhum'),   -- livro-razão: não edita nem apaga
      ('harpia_contratos',         'super',     'super',      'super'),
      ('harpia_servicos_avulsos',  'super',     'super',      'super')
    ) v(tabela, ler, escrever, apagar)
  loop
    e_ler := private.expr_acesso(r.ler);
    e_esc := private.expr_acesso(r.escrever);
    e_del := private.expr_acesso(r.apagar);
    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   r.tabela || '_ler', r.tabela, e_ler);
    if e_esc is not null then
      execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                     r.tabela || '_inserir', r.tabela, e_esc);
      if r.tabela <> 'estoque_movimentos' then
        execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                       r.tabela || '_alterar', r.tabela, e_esc, e_esc);
      end if;
    end if;
    if e_del is not null then
      execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                     r.tabela || '_apagar', r.tabela, e_del);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Catálogo global
-- ---------------------------------------------------------------------
create policy planos_ler on public.planos for select to authenticated using (true);
create policy planos_admin on public.planos for all to authenticated
  using ((select private.eh_super_admin())) with check ((select private.eh_super_admin()));
create policy modulos_ler on public.modulos for select to authenticated using (true);
create policy modulos_admin on public.modulos for all to authenticated
  using ((select private.eh_super_admin())) with check ((select private.eh_super_admin()));
create policy funcionalidades_ler on public.funcionalidades for select to authenticated using (true);
create policy funcionalidades_admin on public.funcionalidades for all to authenticated
  using ((select private.eh_super_admin())) with check ((select private.eh_super_admin()));
create policy plano_funcionalidades_ler on public.plano_funcionalidades for select to authenticated using (true);
create policy plano_funcionalidades_admin on public.plano_funcionalidades for all to authenticated
  using ((select private.eh_super_admin())) with check ((select private.eh_super_admin()));

-- ---------------------------------------------------------------------
-- 5. Pet shops, equipe Harpia e membros
-- ---------------------------------------------------------------------
create policy petshops_ler on public.petshops for select to authenticated
  using ((select private.eh_super_admin()) or id in (select private.meus_petshops()));
create policy petshops_alterar on public.petshops for update to authenticated
  using ((select private.eh_super_admin()) or id in (select private.petshops_com_papel(private.papeis_config())))
  with check ((select private.eh_super_admin()) or id in (select private.petshops_com_papel(private.papeis_config())));
create policy petshops_inserir on public.petshops for insert to authenticated
  with check ((select private.eh_super_admin()));
create policy petshops_apagar on public.petshops for delete to authenticated
  using ((select private.eh_super_admin()));

create policy harpia_equipe_ler on public.harpia_equipe for select to authenticated
  using ((select private.eh_super_admin()) or user_id = (select auth.uid()));
create policy harpia_equipe_admin on public.harpia_equipe for all to authenticated
  using ((select private.eh_super_admin())) with check ((select private.eh_super_admin()));

create policy petshop_membros_ler on public.petshop_membros for select to authenticated
  using ((select private.eh_super_admin())
         or user_id = (select auth.uid())
         or petshop_id in (select private.petshops_com_papel(private.papeis_config())));
-- F2: dono convida a equipe. No MVP só a Harpia cria acessos.
create policy petshop_membros_admin on public.petshop_membros for all to authenticated
  using ((select private.eh_super_admin())) with check ((select private.eh_super_admin()));

-- ---------------------------------------------------------------------
-- 6. Camada global (tutor e pet)
-- Vínculos NÃO têm INSERT direto: só pelas RPCs cadastrar_tutor/cadastrar_pet
-- ou pelo bot. Motivo: o UUID do pet aparece no QR; com INSERT liberado, um
-- pet shop poderia "se vincular" a um pet alheio lendo a plaquinha.
-- ---------------------------------------------------------------------
create policy tutor_petshop_ler on public.tutor_petshop for select to authenticated
  using ((select private.eh_super_admin()) or petshop_id in (select private.meus_petshops()));
create policy tutor_petshop_alterar on public.tutor_petshop for update to authenticated
  using      ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao())))
  with check ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao())));
create policy tutor_petshop_apagar on public.tutor_petshop for delete to authenticated
  using ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_config())));

create policy pet_petshop_ler on public.pet_petshop for select to authenticated
  using ((select private.eh_super_admin()) or petshop_id in (select private.meus_petshops()));
create policy pet_petshop_alterar on public.pet_petshop for update to authenticated
  using      ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao())))
  with check ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao())));
create policy pet_petshop_apagar on public.pet_petshop for delete to authenticated
  using ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_config())));

create policy tutores_ler on public.tutores for select to authenticated
  using ((select private.eh_super_admin())
         or exists (select 1 from public.tutor_petshop tp
                     where tp.tutor_id = tutores.id and tp.petshop_id in (select private.meus_petshops())));

create policy pets_ler on public.pets for select to authenticated
  using ((select private.eh_super_admin())
         or exists (select 1 from public.pet_petshop pp
                     where pp.pet_id = pets.id and pp.petshop_id in (select private.meus_petshops())));
create policy pets_alterar on public.pets for update to authenticated
  using ((select private.eh_super_admin())
         or exists (select 1 from public.pet_petshop pp
                     where pp.pet_id = pets.id and pp.petshop_id in (select private.petshops_com_papel(private.papeis_operacao()))))
  with check ((select private.eh_super_admin())
         or exists (select 1 from public.pet_petshop pp
                     where pp.pet_id = pets.id and pp.petshop_id in (select private.petshops_com_papel(private.papeis_operacao()))));

-- Consentimento: imutável, exceto para revogar (uma vez).
create or replace function private.consentimento_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.tutor_id, new.escopo, new.versao_termo, new.canal, new.concedido_em, new.evidencia)
     is distinct from (old.tutor_id, old.escopo, old.versao_termo, old.canal, old.concedido_em, old.evidencia)
     or (old.revogado_em is not null and new.revogado_em is distinct from old.revogado_em) then
    raise exception 'Consentimento é imutável: registre um novo ou revogue o atual' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger consentimentos_imutavel before update on public.consentimentos
  for each row execute function private.consentimento_imutavel();

create policy consentimentos_ler on public.consentimentos for select to authenticated
  using ((select private.eh_super_admin())
         or exists (select 1 from public.tutor_petshop tp
                     where tp.tutor_id = consentimentos.tutor_id and tp.petshop_id in (select private.meus_petshops())));
create policy consentimentos_inserir on public.consentimentos for insert to authenticated
  with check ((select private.eh_super_admin())
         or (petshop_origem_id in (select private.petshops_com_papel(private.papeis_operacao()))
             and exists (select 1 from public.tutor_petshop tp
                          where tp.tutor_id = consentimentos.tutor_id and tp.petshop_id = consentimentos.petshop_origem_id)));
create policy consentimentos_revogar on public.consentimentos for update to authenticated
  using ((select private.eh_super_admin())
         or exists (select 1 from public.tutor_petshop tp
                     where tp.tutor_id = consentimentos.tutor_id
                       and tp.petshop_id in (select private.petshops_com_papel(private.papeis_operacao()))))
  with check (true);

-- Linha do tempo: o próprio estabelecimento vê tudo dele; outro estabelecimento
-- vinculado ao pet vê só evento clínico compartilhável com consentimento ativo.
create or replace function private.evento_compartilhado_visivel(p_pet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pet_petshop pp
                  where pp.pet_id = p_pet and pp.ativo
                    and pp.petshop_id in (select private.meus_petshops()))
     and private.tutor_consente((select p.tutor_id from public.pets p where p.id = p_pet), 'compartilhar_saude');
$$;

create policy pet_eventos_ler on public.pet_eventos for select to authenticated
  using ((select private.eh_super_admin())
         or petshop_id in (select private.meus_petshops())
         or (visibilidade = 'compartilhavel' and private.evento_compartilhado_visivel(pet_id)));
create policy pet_eventos_inserir on public.pet_eventos for insert to authenticated
  with check ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao())));
create policy pet_eventos_alterar on public.pet_eventos for update to authenticated
  using      ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao())))
  with check ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao())));
create policy pet_eventos_apagar on public.pet_eventos for delete to authenticated
  using ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_config())));

-- Plaquinhas: do pet shop que vendeu.
create policy plaquinhas_ler on public.plaquinhas for select to authenticated
  using ((select private.eh_super_admin()) or petshop_id in (select private.meus_petshops()));
create policy plaquinhas_escrever on public.plaquinhas for all to authenticated
  using      ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao())))
  with check ((select private.eh_super_admin()) or petshop_id in (select private.petshops_com_papel(private.papeis_operacao())));

commit;
