-- PetCare Hub · arquivo 18 · celular para avisos com formato de celular
-- Rodar no SQL Editor depois do 17. Idempotente.
--
-- Motivo: o check do arquivo 13 aceita qualquer E.164 (8 a 15 dígitos), então
-- "+19911100" passava. O celular de avisos recebe WhatsApp, então:
--   Brasil (+55): DDD (2 dígitos, sem zero) + 9 + 8 dígitos  → +55 DD 9XXXX-XXXX
--   Outros países: + e 10 a 15 dígitos (dono com celular estrangeiro)
-- Fixo brasileiro (sem o 9) e número curto são recusados (erro 23514).

begin;

-- Valores já gravados fora do formato (ex.: teste com número incompleto)
-- não recebem aviso de qualquer jeito: são limpos, e o NOTICE mostra quais.
do $$
declare r record;
begin
  for r in
    select b.petshop_id, p.nome, b.telefone_avisos
      from public.bot_config b join public.petshops p on p.id = b.petshop_id
     where b.telefone_avisos is not null
       and not (b.telefone_avisos ~ '^\+55[1-9]{2}9[0-9]{8}$'
                or (b.telefone_avisos !~ '^\+55' and b.telefone_avisos ~ '^\+[1-9][0-9]{9,14}$'))
  loop
    raise notice 'Celular de avisos inválido limpo: % (%): %', r.nome, r.petshop_id, r.telefone_avisos;
  end loop;
end $$;

-- O trigger proteger_bot_config (arquivo 17) só barra usuário do painel;
-- este update roda como dono do banco no SQL Editor.
update public.bot_config
   set telefone_avisos = null
 where telefone_avisos is not null
   and not (telefone_avisos ~ '^\+55[1-9]{2}9[0-9]{8}$'
            or (telefone_avisos !~ '^\+55' and telefone_avisos ~ '^\+[1-9][0-9]{9,14}$'));

alter table public.bot_config drop constraint if exists bot_config_telefone_avisos_celular;
alter table public.bot_config add constraint bot_config_telefone_avisos_celular check (
  telefone_avisos is null
  or telefone_avisos ~ '^\+55[1-9]{2}9[0-9]{8}$'
  or (telefone_avisos !~ '^\+55' and telefone_avisos ~ '^\+[1-9][0-9]{9,14}$')
);

comment on constraint bot_config_telefone_avisos_celular on public.bot_config is
  'Celular de avisos: no Brasil +55 DDD 9XXXXXXXX; fora do Brasil 10 a 15 dígitos (arquivo 18)';

commit;

-- Aceite: rodar supabase/testes/aceite_rodada_d.sql de novo (o D4 agora cobre o formato de celular).
