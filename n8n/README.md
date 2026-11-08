# n8n/ — Bot do WhatsApp e automações do PetCare Hub

O N8n só conversa e orquestra. Toda regra de negócio está no banco (funções RPC dos
arquivos 05, 12, 13 e 14 em `supabase/schema/`). Os workflows não guardam segredos: usam
credenciais do N8n, criadas à mão, e leem o token de cada pet shop no Supabase Vault.

## Estrutura

| Caminho | O que é |
|---|---|
| `src/motor-conversa.js` | **Fonte** do motor de conversa (BT-01 a BT-06, BT-08 a BT-10, BT-12, BT-16 a BT-18, CM-01, CM-03). Função pura: pede uma RPC por vez. |
| `build.js` | Gera `workflows/*.json` e copia o motor para o nó "Motor (passo)". |
| `test/simular.js` | Simula conversas completas contra um Postgres com o schema (faz o papel do N8n). |
| `workflows/00-rpc-supabase.json` | Sub-workflow único que chama `POST /rest/v1/rpc/<fn>`. Único lugar com o endereço do Supabase. |
| `workflows/01-bot-conversa.json` | Webhook "Ao receber" da Z-API → motor → envio → `mensagens_log`. |
| `workflows/02-lembretes-24h.json` | Cron 10h: lembrete SIM/NÃO (CM-02) e aviso ao dono de agendamento em período bloqueado. |
| `workflows/03-conexao-whatsapp.json` | PL-03: webhooks de conexão da Z-API + checagem a cada 15 min; alerta por e-mail. |
| `workflows/04-erros.json` | PL-04: Error Workflow; grava em `fluxo_erros` e manda até 1 e-mail por hora. |
| `workflows/05-canal-teste.json` | Chat do N8n (Chat Trigger com Basic Auth) ligado ao mesmo motor, sem WhatsApp. Só alcança pet shop com `bot_config.canal = 'teste'`. Comandos: `#ajuda`, `#novo`, `#tel`, `#dono`, `#devolver`, `#lembrete`, `#estado`. |

> Os workflows 01, 02 e 03 estão no formato da Z-API clássica e esperam a escolha do provedor de WhatsApp. O motor não muda: cada provedor ganha só o seu normalizador de webhook, o envio e o alerta de queda.

## Regras de manutenção

- **Não edite o código do motor dentro do N8n.** Edite `src/motor-conversa.js`, rode
  `node n8n/test/simular.js` (banco local ou de teste) e `node n8n/build.js`, e reimporte
  o `01-bot-conversa.json` (ou cole o novo código no nó).
- Ao exportar do N8n para versionar, confira que o JSON não tem segredo: só `id` e `name`
  de credencial. O build já sai assim.
- Conflito de horário: `reservar_agendamento` devolve HTTP 400 com `code: "23P01"`. Trate
  sempre pelo `code`.

## Credenciais (criar no N8n → Credentials → Header Auth)

| Nome exato | Header | Valor |
|---|---|---|
| `Supabase · secret n8n-bot` | `apikey` | Secret key dedicada `n8n-bot` (`sb_secret_…`). Sem `Authorization: Bearer`: a chave nova não é JWT. |
| `Canal de teste · acesso` (Basic Auth) | usuário e senha | Página pública do chat de teste: senha forte. |
| `Resend · alertas` | `Authorization` | `Bearer re_…` (API key `n8n-alertas`, só envio, só `petcarehub.com.br`). |

## Testar sem WhatsApp

```bash
PGURL="postgresql://postgres@/pc?host=/tmp&port=5433" node n8n/test/simular.js
```

Precisa de um Postgres com o schema 01–14 e o seed de teste (Pet Feliz). Os cenários
gravam dados: nunca aponte para produção.
