-- =====================================================================
-- PetCare Hub · schema rev. 3 · arquivo 12 — rodada 4 do painel
-- CF-01 (dados do pet shop), CF-03/AG-07 (feriados e bloqueios: nada novo
-- no banco, o motor já trata) e AC-02 (convite com vínculo).
-- Idempotente: pode rodar de novo sem erro.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- CF-01 · Telefone de contato do pet shop
-- Separado de telefone_wp (número do bot, protegido: só a Harpia altera).
-- Pode ser fixo ou celular; vai nas respostas do bot ("ligue para...").
-- ---------------------------------------------------------------------
alter table public.petshops add column if not exists telefone_contato text;
do $$ begin
  alter table public.petshops add constraint petshops_telefone_contato_e164
    check (telefone_contato is null or telefone_contato ~ '^\+[1-9][0-9]{7,14}$');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- CF-01 · Logo do pet shop no Supabase Storage
-- Bucket público (a logo aparece no painel e, no futuro, na ficha pública).
-- Caminho obrigatório: logos/<petshop_id>/<arquivo>. Só dono/gerente do
-- pet shop (ou super admin) grava; leitura é pública pela URL.
-- Sem SVG: SVG servido pelo Storage pode carregar script.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists logos_inserir on storage.objects;
drop policy if exists logos_alterar on storage.objects;
drop policy if exists logos_apagar  on storage.objects;

create policy logos_inserir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and ((select private.eh_super_admin())
         or (storage.foldername(name))[1] in
            (select p::text from private.petshops_com_papel(private.papeis_config()) p)));

create policy logos_alterar on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and ((select private.eh_super_admin())
         or (storage.foldername(name))[1] in
            (select p::text from private.petshops_com_papel(private.papeis_config()) p)))
  with check (
    bucket_id = 'logos'
    and ((select private.eh_super_admin())
         or (storage.foldername(name))[1] in
            (select p::text from private.petshops_com_papel(private.papeis_config()) p)));

create policy logos_apagar on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and ((select private.eh_super_admin())
         or (storage.foldername(name))[1] in
            (select p::text from private.petshops_com_papel(private.papeis_config()) p)));

-- ---------------------------------------------------------------------
-- CF-01 → bot · Dados do pet shop para saudação e respostas.
-- Só o N8n (service_role) chama, como as demais funções do bot.
-- ---------------------------------------------------------------------
create or replace function public.bot_petshop_info(p_petshop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'nome',             p.nome,
           'endereco',         p.endereco,
           'telefone_contato', p.telefone_contato,
           'logo_url',         p.logo_url,
           'fuso',             p.fuso,
           'nome_bot',         b.nome_bot,
           'saudacao',         replace(replace(coalesce(b.saudacao, ''), '{bot}', coalesce(b.nome_bot, '')), '{petshop}', p.nome),
           'horarios',         coalesce((
             select jsonb_agg(jsonb_build_object('dia_semana', h.dia_semana,
                                                 'abre', left(h.abre::text, 5),
                                                 'fecha', left(h.fecha::text, 5))
                              order by h.dia_semana, h.abre)
               from public.horarios_funcionamento h where h.petshop_id = p.id), '[]'::jsonb))
    from public.petshops p
    left join public.bot_config b on b.petshop_id = p.id
   where p.id = p_petshop;
$$;
revoke execute on function public.bot_petshop_info(uuid) from public, anon, authenticated;
grant  execute on function public.bot_petshop_info(uuid) to service_role;

-- ---------------------------------------------------------------------
-- AC-02 · Vínculo do convidado ao pet shop.
-- Chamada só pela Edge Function convidar-membro (service_role), logo depois
-- de auth.admin.inviteUserByEmail. Também serve para usuário que já existe
-- (rede/franquia): só cria ou reativa o vínculo.
-- ---------------------------------------------------------------------
create or replace function public.admin_vincular_membro(
  p_email text, p_petshop uuid, p_papel text default 'dono', p_nome text default null)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Usuário % não encontrado no Auth', p_email using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.petshops where id = p_petshop) then
    raise exception 'Pet shop % não existe', p_petshop using errcode = 'P0002';
  end if;
  insert into public.petshop_membros (petshop_id, user_id, nome, papel, ativo)
  values (p_petshop, v_user, nullif(trim(p_nome), ''), p_papel, true)
  on conflict (petshop_id, user_id) do update
    set papel = excluded.papel,
        nome  = coalesce(excluded.nome, public.petshop_membros.nome),
        ativo = true;
  return v_user;
end $$;
revoke execute on function public.admin_vincular_membro(text, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.admin_vincular_membro(text, uuid, text, text) to service_role;

commit;
