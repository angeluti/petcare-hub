# Ficha pública e número central de achados · implantação

Decisões de 11/11/2026 (chat "Ficha pública, Meu Pet e plaquinhas"). Entrega:

| Arquivo | O que é |
|---|---|
| `supabase/schema/21_ficha_publica.sql` | Remove o INSERT/UPDATE direto do pet shop em `plaquinhas` (política do 07). Código curto, status da plaquinha, níveis da ficha, consentimento `ficha_publica`, número central, achados, funções do bot, do painel e do admin |
| `supabase/testes/aceite_ficha.sql` | `private.aceite_ficha()`, F1–F14. Esperado: `ACEITE FICHA OK` |
| `supabase/testes/aceite_regressao.sql` | R00–R09: as verificações do 10 (agenda, capacidade, reserva, check-out, RLS, bot, compartilhamento) num banco de teste já usado. Esperado: `REGRESSÃO OK` |
| `supabase/testes/dados_ficha_teste.sql` | Mel básica e Bob completa, com plaquinhas, para ver a página (grava) |
| `supabase/schema/08_seed.sql`, `10_testes.sql` | Seed sem `pets.ficha_publica`; T11 com a ficha nova |
| `n8n/src/motor-conversa.js` | Fluxo do número central (ACHEI, FICHA, PERDI) |
| `n8n/build.js` | `Preparar log` pula mensagens sem pet shop; canal de teste com `#central` |
| `n8n/test/central.test.js` | 8 casos do número central, sem banco: `node n8n/test/central.test.js` |
| `apps/pet/` | Página da ficha (Astro estático) |

## Ordem (ficha primeiro; o "Achei" depois)

1. **Banco.**
   - Substitua `08_seed.sql` e `10_testes.sql` pelas versões desta entrega: o 08 deixa de gravar `pets.ficha_publica` e usa o código `TH0R26`; o T11 do 10 testa a ficha nova.
   - Rode o 21 no SQL Editor. No banco atual, a plaquinha `THOR2026AB` do seed ganha um código novo (aviso no NOTICE); o T11 procura o código pelo pet.
   - Rode o 10 de novo (`select * from private.rodar_testes_petcare();`) → "TODOS OS TESTES OK", e `aceite_ficha.sql` → "ACEITE FICHA OK". Rode também `aceite_bot.sql` e `aceite_evolution.sql` (o 21 refaz `bot_instancias_monitoradas` e `bot_conexao_evento`).
   - Para ver os três estados na página: `dados_ficha_teste.sql` (grava). Ele devolve os endereços de Thor (desligada), Mel (básica) e Bob (completa).
2. **Página.** Projeto `petcare-hub-pet` no Cloudflare Pages e DNS do `pet.` (ver `apps/pet/README.md`). Abra os três endereços no celular.
3. **Motor.** Copie `motor-conversa.js` e `build.js`, rode `node n8n/test/central.test.js`, `node n8n/build.js` e reimporte **01 · Bot conversa**, **02 · Lembretes 24h** e **05 · Canal de teste** (o 02 muda só o `Preparar log`). Sem o número central cadastrado, nada muda para os pet shops.
4. **Número central** (abaixo), quando for a hora do "Achei". Até lá, a página mostra a orientação de levar o pet a um pet shop ou clínica, e o tutor ainda não consegue ligar a ficha sozinho: o pedido FICHA chega pelo número central.
5. **Primeira plaquinha real.** `select admin_gerar_plaquinha('<petshop>', '<pet>', 'essencial', 'aço pintado');` no SQL Editor, gravar o QR com `HTTPS://PET.PETCAREHUB.COM.BR/<CODIGO>` (maiúsculas) e testar a leitura.

Teste sem WhatsApp do número central: no chat de teste, `#central`, depois `ACHEI <codigo> recado`; `#tel` com o telefone do tutor e `FICHA <codigo>`.

## Número central na Evolution

Um número de WhatsApp conecta em **uma** instância. O número que hoje é o chip de teste da Pata Amiga pode virar o número central, mas deixa de ser o bot da Pata Amiga.

1. **Pata Amiga sai desse chip:** `update bot_config set ativo = false where instancia = 'pata-amiga';` e, no manager da Evolution, desconectar e apagar a instância `pata-amiga` (ou mantê-la para outro chip). Os testes do bot de pet shop seguem pelo chat de teste do N8n.
2. **Perfil do WhatsApp Business do chip:** nome "PetCare Hub" e o símbolo Selo como foto. É o que o tutor vê quando recebe o aviso.
3. **Criar a instância** `petcarehub-achados` com as mesmas opções dos pet shops:

```http
POST {EVO}/instance/create
apikey: <chave global>
{
  "instanceName": "petcarehub-achados",
  "integration": "WHATSAPP-BAILEYS",
  "qrcode": true,
  "groupsIgnore": true, "alwaysOnline": false, "readMessages": false,
  "rejectCall": false, "syncFullHistory": false,
  "webhook": {
    "url": "https://n8n.petcarehub.com.br/webhook/petcare-hub/evolution",
    "byEvents": false, "base64": false,
    "headers": { "x-petcare-secret": "<segredo do webhook>" },
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }
}
```

4. Conectar o chip pelo QR (Dispositivos conectados).
5. Cadastrar no banco:

```sql
insert into public.canais_plataforma (funcao, canal, instancia, telefone_wp, ativo)
values ('achados', 'evolution', 'petcarehub-achados', '+55DDDNUMERO', true)
on conflict (funcao) do update set canal = excluded.canal, instancia = excluded.instancia,
  telefone_wp = excluded.telefone_wp, ativo = excluded.ativo;
```

**Trocar o chip depois** (bloqueio ou número definitivo): nova instância, novo `update` em `canais_plataforma`. O QR das plaquinhas não muda: o número vem do banco.

## Riscos aceitos

- **Primeira mensagem ao tutor sai do número central sem conversa anterior.** É fora das regras de envio da Evolution (seção 7.1). Volume baixo (1 por plaquinha a cada 30 min, 10 por pessoa em 24 h) e alto valor. Se o central for bloqueado, a página mostra "aviso fora do ar" quando `ativo = false`.
- **Não usar o WhatsApp comercial do site** como número central: todo texto que chega recebe a resposta automática de achados.
- **O tutor decide se chama quem achou.** Quem achou expõe o próprio número por escolha (texto na página).

## Para o chat do painel

Funções prontas (com papel conferido no banco):

- `painel_plaquinhas_pet(p_petshop, p_pet)`: bloco "Plaquinha e ficha pública" na ficha do pet (nível efetivo, consentimento, plaquinhas com status e leituras). Só leitura.
- `painel_ficha_desligar(p_petshop, p_pet)`: botão "Desligar a ficha" a pedido do tutor, com confirmação na tela.
- `painel_plaquinha_desativar(p_petshop, p_plaquinha, p_motivo)`: botão "Desativar plaquinha" (perdida ou trocada).
- `admin_gerar_plaquinha(...)` e `admin_lote_plaquinhas(p_desde)`: só super admin (aba Acessos ou futura tela Harpia).

O painel nunca liga a ficha: o `UPDATE` direto em `pets.ficha_nivel` e em `plaquinhas.status` é recusado (42501). Regenerar os tipos (`database.types.ts`): sai `pets.ficha_publica`, entram `ficha_nivel`, `ficha_alterada_*` e as colunas novas de `plaquinhas`.
