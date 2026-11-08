# Trechos "localizar → substituir" da etapa 5 (rev. 2: canal de WhatsApp em reavaliação + canal de teste).
# MESTRE: aplicar agora. MESTRE_DEPOIS: só depois de escolher o provedor de WhatsApp.
GUIA_URL = '{{GUIA_URL}}'

MESTRE = [
  ("Cabeçalho: versão",
   r'''> **Versão:** 06/11/2026, rev. 3.11 (rodada 4 do painel: dados do pet shop, feriados e bloqueios, convite) · **Idioma:** português (BR).''',
   r'''> **Versão:** 06/11/2026, rev. 3.12 (etapa 5: bot construído com canal de teste; canal de WhatsApp em reavaliação) · **Idioma:** português (BR).'''),

  ("Cabeçalho: guia do schema e guia do bot",
   r'''> **Schema do banco:** o guia "Schema PetCare Hub rev. 3" (https://claude.ai/artifact/1pQxA8WDrXx7EBNtZ1TVVX) traz os arquivos SQL 00 a 11, a matriz de acessos, o motor de agenda e a adaptação do bot.''',
   r'''> **Schema do banco:** o guia "Schema PetCare Hub rev. 3" (https://claude.ai/artifact/1pQxA8WDrXx7EBNtZ1TVVX) traz os arquivos SQL 00 a 11, a matriz de acessos e o motor de agenda. Os arquivos 12 a 16 estão no repositório.
> **Bot:** o guia "Bot PetCare no N8n" (''' + GUIA_URL + r''') traz os arquivos 13 a 16, o N8n, o canal de teste e o aceite da etapa 5.'''),

  ("0. Resumo, item 5",
   r'''WhatsApp pela **Z-API** no MVP e na POC; API oficial da Meta só ao escalar (seção 7.1).''',
   r'''Canal de WhatsApp **em reavaliação** desde 06/11/2026: a Z-API virou Z-API Omni, só com API oficial da Meta (seção 7.1).'''),

  ("0. Resumo, item 8",
   r'''O workflow do bot foi montado, mas não foi testado e precisa ser adaptado ao schema novo.''',
   r'''O bot foi reescrito para chamar só funções do banco (arquivos 13 a 15 e workflows em `n8n/`) e **aprovado pelo canal de teste** (chat do N8n, sem WhatsApp) em 08/11/2026; falta o provedor de WhatsApp.'''),

  ("5. POC: pré-requisitos",
   r'''canal de WhatsApp = Z-API (✅ decidido 06/11/2026), Z-API paga e chip definitivo, reativar o Railway (Pro),''',
   r'''canal de WhatsApp (em reavaliação desde 06/11/2026; seção 7.1) com plano pago e chip definitivo, Railway no Pro, **bot aprovado no canal de teste** (✅ 08/11/2026), **celular de avisos do dono** (`bot_config.telefone_avisos`),'''),

  ("5. POC: começar pelo painel",
   r'''- **Ordem de ativação:** o dono usa a agenda do painel por 1 semana **antes** de o bot ser ligado.''',
   r'''- **Ordem de ativação:** o dono usa a agenda do painel por 1 semana **antes** de o bot ser ligado.
- **Linha de base do no-show:** se o canal de WhatsApp atrasar, a POC pode começar só com o painel. As semanas sem bot dão a taxa de no-show de partida, sem a qual a meta de −50% não tem com o que comparar (RL-03).'''),

  ("3. Identidade compartilhada: nome do tutor",
   r'''- **Compartilhável entre estabelecimentos (com consentimento do tutor):** dados básicos do pet (nome, espécie, raça, nascimento, porte), alergias e condições, vacinas e prontuário clínico.''',
   r'''- **Compartilhável entre estabelecimentos (com consentimento do tutor):** dados básicos do pet (nome, espécie, raça, nascimento, porte), alergias e condições, vacinas e prontuário clínico, e **o nome do tutor** (decidido em 08/11/2026: quem achar o pet precisa saber de quem ele é; o bot cumprimenta pelo nome no primeiro contato). O termo de consentimento precisa dizer isso.'''),

  ("8. Regra: tutor global guarda só o telefone",
   r'''- **Tutor global guarda só o telefone** (E.164). Nome, e-mail, endereço, observações e opt-out de mensagens ficam em `tutor_petshop`.''',
   r'''- **Tutor global guarda só o telefone** (E.164). Nome, e-mail, endereço, observações e opt-out de mensagens ficam em `tutor_petshop`. **Exceção com consentimento:** o nome do tutor pode ir para outro pet shop (`bot_nome_compartilhado`, arquivo 15; `bot_vincular_pet_compartilhado` copia o nome ao criar o vínculo). E-mail, endereço e observações nunca.'''),

  ("9. Tutor conhecido em outro pet shop",
   r'''- Conhecido **em outro pet shop do Hub** (com consentimento de compartilhamento): o bot oferece os pets já cadastrados e pula pet, porte e demais dados. Nunca menciona o outro estabelecimento.''',
   r'''- Conhecido **em outro pet shop do Hub** (com consentimento de compartilhamento): o bot cumprimenta pelo nome ("Oi, Elisa! Eu sou a Luna…"), oferece os pets já cadastrados e pula nome, pet, porte e demais dados. Nunca menciona o outro estabelecimento.
- **Saudação no meio de um fluxo** ("oi", "bom dia"): o bot cumprimenta pelo nome e repete a pergunta em vez de "Não entendi". Nas perguntas de nome, "Oi" é lido como resposta.
- **Pendência futura:** avisar o tutor que a plataforma reconheceu o cadastro dele. Escrever junto com o termo (TP-12): o dono lê a mesma conversa, e o texto não pode revelar que o tutor usa outro pet shop.'''),

  ("9. Regras do MVP: consentimento e opt-out",
   r'''**Regras do MVP:** "falar com atendente" (transbordo com aviso ao dono), **pausa automática quando o dono responde pelo celular**, pausa manual por tutor, timeout de conversa parada, resposta fora do horário, resposta educada para áudio, mídia e grupos, limite de mensagens automáticas por tutor.''',
   r'''**Regras do MVP:** "falar com atendente" (transbordo com aviso ao dono), **pausa automática quando o dono responde pelo celular**, pausa manual por tutor, timeout de conversa parada, resposta fora do horário, resposta educada para áudio, mídia e grupos, limite de mensagens automáticas por tutor.

**Consentimento e opt-out (TP-12 e TP-15, decididos em 08/11/2026):**
- Depois do **primeiro agendamento** em cada pet shop, o bot pergunta se pode compartilhar os dados básicos do pet e o nome do tutor com outros pet shops do PetCare Hub. SIM grava o consentimento `compartilhar_dados_pet` com versão do termo, canal `bot`, pet shop de origem e evidência (id e texto da resposta). NÃO, ou qualquer outra resposta, só marca que perguntou (silêncio não é consentimento). Não pergunta de novo naquele pet shop.
- O texto do termo fica em `termos_consentimento`, com versão. Hoje é o rascunho `bot-v0-rascunho-2026-11`; depois da revisão jurídica, entra uma versão nova marcada como vigente, sem mexer no bot.
- Saúde (`compartilhar_saude`) fica para o módulo Vet; marketing (reativação e promoções), para o F2.
- **SAIR**, **PARAR** ou **STOP**, em qualquer passo da conversa, desligam as mensagens automáticas daquele pet shop (`tutor_petshop.aceita_mensagens`); **ATIVAR** religa. A conversa continua no passo em que estava. O lembrete termina com "Para não receber lembretes, responda SAIR".
- **REVOGAR** desfaz o consentimento de compartilhamento (`revogado_em`).'''),

  ("12. Negócio: item 18 (advogado)",
   r'''18. Consultar advogado sobre o consentimento LGPD para compartilhar dados entre estabelecimentos (o seed usa um termo fictício `v0-teste`).''',
   r'''18. Consultar advogado sobre o consentimento LGPD para compartilhar dados entre estabelecimentos. Levar o texto `bot-v0-rascunho-2026-11` (tabela `termos_consentimento`), que inclui o **nome do tutor** entre os dados compartilhados, e a base legal do lembrete (sem consentimento, com opt-out por SAIR). O seed usa um termo fictício `v0-teste`.'''),

  ("7. Tabela da stack: WhatsApp",
   r'''| WhatsApp | **Z-API** (instância web), decidido em 06/11/2026; API oficial da Meta só ao escalar | 1 número por pet shop |''',
   r'''| WhatsApp | **Em reavaliação** (06/11/2026): a Z-API virou Omni, só API oficial. Opções na seção 7.1. Enquanto isso, **canal de teste** (chat do N8n) | 1 número por pet shop |'''),

  ("7. Repositório: schema",
   r'''| `supabase/schema` | Arquivos 00 a 12 do schema rev. 3 (12 = rodada 4 do painel) |''',
   r'''| `supabase/schema` | Arquivos 00 a 15 do schema rev. 3 (12 = rodada 4 do painel; 13 = RPCs do bot no N8n; 14 = canal de teste; 15 = nome do tutor compartilhado; 16 = consentimento e opt-out pelo bot) |'''),

  ("7. Repositório: testes",
   r'''| `supabase/testes` | `aceite_painel.sql` (A1–A4) e `aceite_rodada4.sql` (A5–A7) |''',
   r'''| `supabase/testes` | `aceite_painel.sql` (A1–A4), `aceite_rodada4.sql` (A5–A7) e `aceite_bot.sql` (B1–B11) |'''),

  ("7. Repositório: n8n",
   r'''| `n8n/` | Exports dos workflows (revisar credenciais antes de commitar) |''',
   r'''| `n8n/` | Bot e automações: `src/motor-conversa.js` (fonte do motor), `build.js` (gera `workflows/00` a `05`), `test/simular.js` (simula conversas contra um Postgres). Os JSON levam só o nome das credenciais |'''),

  ("7.1 Decisão do canal (parágrafo inteiro)",
   r'''**Decisão (06/11/2026): Z-API no MVP e na POC; API oficial da Meta só ao escalar.** Motivos: a Z-API não exige verificação da empresa (a Harpia Tech ainda não tem CNPJ) e já está configurada. Gatilhos para migrar: volume de clientes em que a diferença de custo pese (~R$55 por cliente/mês, seção 10), quedas de sessão ou banimento, ou empresa da Rota A aberta. O schema já suporta os dois canais (`bot_config.zapi_instance_id` ou `meta_phone_number_id`). Confirmar a tabela de preços oficial da Meta antes de migrar.''',
   r'''**Canal em reavaliação (06/11/2026).** A decisão do mesmo dia (Z-API por QR Code no MVP e na POC) caiu: a Z-API passou a vender a Z-API Omni, que só conecta pela API oficial da Meta. O canal por QR Code saiu da documentação do Omni em 03/11/2026. A decisão está sendo tomada em outro chat do projeto, com estes critérios:
- custo por pet shop por mês, com as tarifas da Meta (no Brasil, desde 01/10/2026, utilidade R$0,035 por mensagem e 1.000 mensagens de atendimento grátis por número por mês);
- exigência de CNPJ da Harpia;
- risco de banimento;
- esforço de operação para um dev part-time;
- mensagem enviada pelo dono no celular chegando por webhook (necessária para pausar o bot).

Opções em comparação: provedor não oficial como serviço (Zapster e similares), Evolution API no Railway, API oficial por provedor credenciado (Omni, Twilio, Telnyx, 360dialog) e a conta antiga da Z-API clássica.
- **Enquanto isso:** o bot roda pelo canal de teste (chat do N8n, arquivo 14). O motor não depende do provedor; trocar de provedor muda só a leitura do webhook, o envio e o alerta de queda.'''),

  ("7.2 Ao reativar o Railway",
   r'''4. Depois, migrar para `harpiatechstudio.com.br`, com os mesmos três ajustes.''',
   r'''4. Depois, migrar para `harpiatechstudio.com.br`, com os mesmos três ajustes.
5. **Atualização (06/11/2026):** o Railway foi refeito do zero (projeto novo do N8n com Postgres), porque a conta antiga da Z-API e o workflow antigo foram descartados. Projeto em US East (o mais perto de São Paulo no Railway), imagem fixada em `n8nio/n8n:2.46.6` e `N8N_ENCRYPTION_KEY` nova guardada no gerenciador de senhas. Durante o desenvolvimento, o plano Hobby basta; o Pro continua obrigatório antes da POC.'''),

  ("7.2 Variáveis de ambiente do N8n",
   r'''**Variáveis de ambiente do N8n (só nomes):**
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `N8N_BASIC_AUTH_ACTIVE/USER/PASSWORD`, `EXECUTIONS_DATA_SAVE_ON_ERROR=all`, `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`, além das geradas pelo template (`DB_POSTGRESDB_*`, `N8N_ENCRYPTION_KEY`, `N8N_EDITOR_BASE_URL`, `WEBHOOK_URL` etc.).
- **Saíram:** `PETSHOP_ID`, `ZAPI_INSTANCE_ID` e `ZAPI_TOKEN`. O pet shop é descoberto pela instância que recebeu a mensagem (`bot_config.zapi_instance_id` ou `meta_phone_number_id`), e o token de cada pet shop fica no **Supabase Vault**, lido pela função `bot_token(petshop)`. Assim um único N8n atende vários pet shops.''',
   r'''**Variáveis de ambiente do N8n (só nomes):**
`N8N_EDITOR_BASE_URL`, `WEBHOOK_URL`, `GENERIC_TIMEZONE=America/Sao_Paulo`, `TZ=America/Sao_Paulo`, `N8N_PROXY_HOPS=1`, `EXECUTIONS_DATA_SAVE_ON_ERROR=all`, `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`, além das geradas pelo template (`DB_POSTGRESDB_*`, `N8N_ENCRYPTION_KEY` etc.).
- **Saíram:** `PETSHOP_ID`, `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` e `N8N_BASIC_AUTH_*` (o login do N8n é a conta de owner). O pet shop é descoberto pela instância que recebeu a mensagem, e o token de cada pet shop fica no **Supabase Vault**, lido por `bot_envio(petshop)`. Assim um único N8n atende vários pet shops.
- **Segredos ficam em credenciais do N8n** (cifradas com a `N8N_ENCRYPTION_KEY`), não em variáveis: o N8n 2.x bloqueia `$env` nos nós por padrão.
    - `supabase n8n-bot`: header `apikey` com a Secret key dedicada `n8n-bot`, **sem** `Authorization: Bearer`, porque a chave nova não é JWT.
    - `chat de teste`: usuário e senha da página do chat de teste.
    - `resend n8n-alertas`: `Authorization: Bearer` da API key `n8n-alertas`, só envio, só `petcarehub.com.br`.
    - A credencial do provedor de WhatsApp entra quando ele for escolhido.
- O endereço do Supabase fica num lugar só: o nó "Chamar RPC" do sub-workflow `PetCare · RPC Supabase`.'''),

  ("7.2 Acessos: chaves dedicadas",
   r'''- **Pendência:** confirmar se o segredo `PETCARE_SECRET_KEY` foi criado (chave dedicada `edge-convidar-membro`), para não depender da chave legada.''',
   r'''- **Pendência:** confirmar se o segredo `PETCARE_SECRET_KEY` foi criado (chave dedicada `edge-convidar-membro`), para não depender da chave legada.
- **Uma Secret key por consumidor (decidido em 06/11/2026):** `edge-convidar-membro` para a Edge Function e `n8n-bot` para o N8n. Cada uma pode ser revogada sem derrubar a outra.'''),

  ("8. Testes de aceite",
   r'''Os dois rodam no SQL Editor e desfazem tudo no final. Resultados esperados: "ACEITE OK" e "ACEITE RODADA 4 OK".''',
   r'''Também há `aceite_bot.sql` (`private.aceite_bot()`, B1–B11) para as RPCs dos arquivos 13 a 16: serviços do bot, eco do fromMe, filtros do lembrete, SIM/NÃO, aviso de bloqueio, alerta de conexão, permissões, canal de teste, nome compartilhado só com consentimento, consentimento pelo bot e opt-out.

Os três rodam no SQL Editor e desfazem tudo no final. Resultados esperados: "ACEITE OK", "ACEITE RODADA 4 OK" e "ACEITE BOT OK".'''),

  ("8. Tabela de arquivos: linhas 13 e 14",
   r'''| 12 | Rodada 4 do painel: `petshops.telefone_contato`, bucket `logos` com políticas por pasta do pet shop, `bot_petshop_info` e `admin_vincular_membro` (as duas só para `service_role`) |''',
   r'''| 12 | Rodada 4 do painel: `petshops.telefone_contato`, bucket `logos` com políticas por pasta do pet shop, `bot_petshop_info` e `admin_vincular_membro` (as duas só para `service_role`) |
| 13 | Bot no N8n: estados `aguardando_nome`, `aguardando_nome_pet` e `aguardando_servico`; `bot_config.telefone_avisos` e `conexao_alertado_em`; tabela `fluxo_erros`; RPCs `bot_servicos`, `bot_envio`, `bot_aberto_agora`, `bot_registrar_mensagem`, `bot_registrar_fromme`, `bot_lembrete_marcar`/`desmarcar`, `bot_responder_lembrete`, `bot_agendamentos_em_bloqueio`, `bot_instancias_monitoradas`, `bot_conexao_evento` e `bot_registrar_erro`; `lembretes_pendentes` refeita. Tudo só para `service_role` |
| 14 | Canal de teste: `'teste'` aceito em `bot_config.canal` e `mensagens_log.canal`; `bot_petshop_teste(slug)` só acha pet shop com `canal = 'teste'` |
| 15 | `bot_nome_compartilhado(tutor)`: nome do vínculo mais recente do tutor, só com o consentimento `compartilhar_dados_pet` ativo |
| 16 | Consentimento e opt-out pelo bot: estado `aguardando_consentimento`; `tutor_petshop.consentimento_perguntado_em`; tabela `termos_consentimento` (texto com versão, um vigente por escopo e canal); `bot_consentimento_pendente`, `bot_registrar_consentimento`, `bot_revogar_consentimento` e `bot_definir_mensagens` |'''),

  ("9. Menu",
   r'''**Menu:** 1) Agendar banho · 2) Agendar tosa · 3) Agendar banho+tosa · 4) Consultar agendamento · 5) Cancelar agendamento. Remarcação entra no F2.''',
   r'''**Menu:** 1) Agendar um horário · 2) Ver meus agendamentos · 3) Cancelar um agendamento · 4) Falar com a equipe. Ao agendar, o bot pergunta o pet e depois lista os serviços do pet shop para aquele porte, com preço (`bot_servicos`: estética, ativos, `disponivel_bot`, sem adicionais). "0" ou "menu" volta ao início em qualquer passo; "agendar", "cancelar" e "atendente" também funcionam. Remarcação entra no F2.'''),

  ("9. Máquina de estados",
   r'''| `aguardando_pet` → `aguardando_porte` → `aguardando_data` → `aguardando_hora` → `aguardando_confirmacao` | Fluxo de agendamento (pet já cadastrado pula `aguardando_porte`) |''',
   r'''| `aguardando_nome` → `aguardando_nome_pet` → `aguardando_porte` | Cadastro pelo bot: nome do tutor (só de quem não é conhecido no pet shop), nome e porte do pet novo. Pet cadastrado pelo bot nasce como cão; o painel corrige |
| `aguardando_pet` → `aguardando_servico` → `aguardando_data` → `aguardando_hora` → `aguardando_confirmacao` | Fluxo de agendamento (pet já cadastrado ou compartilhado pula o cadastro) |
| `aguardando_consentimento` | Pergunta de compartilhamento depois do 1º agendamento (uma vez por pet shop). SIM grava; NÃO ou qualquer outra resposta só marca que perguntou |'''),

  ("9. Workflow principal (trecho inteiro, do título até a linha da chamada das funções)",
   r'''**Workflow principal (montado, não testado; adaptar ao schema rev. 3):**
1. **Webhook** (POST, path `petcare-hub`, *Respond: Immediately*). Descobre o pet shop com `bot_petshop_por_instancia(instanceId)`, no lugar da variável `PETSHOP_ID`.
2. **IF** `fromMe`: chama `bot_pausar_por_humano(petshop, telefone)`. Cada resposta do dono estende a pausa.
3. **Supabase (RPC)** `bot_entrada(petshop, telefone)`: devolve estado, `dados_temp`, se o tutor é conhecido no pet shop, os pets dele e os pets compartilháveis. Já aplica o fim da pausa humana e o timeout. Cadastro pelo bot: `bot_cadastrar_tutor`, `cadastrar_pet` e `bot_vincular_pet_compartilhado`.
4. **IF/Switch por estado**: `novo` → boas-vindas; `idle` → menu; `menu` → Switch; `aguardando_*` → continua; `humano` e `bloqueado` → para.
5. **Switch** numérico com `{{ $json.message.trim() }}`, igualdade "1".."5" e **Fallback Output** ativo.
6. **Data e hora:** `proximos_dias_com_vaga` e `horarios_livres_resumo`. **Confirmação:** `reservar_agendamento(..., 'bot')`; tratar a resposta com `code: "23P01"` (vem como HTTP 400) como horário tomado e oferecer os próximos. **Consultar e cancelar:** `bot_agendamentos_tutor` e `bot_cancelar` (respeita a antecedência mínima de cancelamento).
7. **Cada passo** grava o estado com `bot_salvar_estado(conversa, estado, dados_temp)`.
8. **Set** monta a variável `resposta`; **HTTP Request** único no final, enviando pelo canal do pet shop com o token lido por `bot_token(petshop)`.

- Chamada das funções pelo N8n: `POST {SUPABASE_URL}/rest/v1/rpc/<funcao>` com a Secret key. **Confirmar no primeiro teste** se basta o header `apikey` ou se também é preciso `Authorization: Bearer`.''',
   r'''**Workflows (construídos em 06/11/2026):** em `n8n/workflows/`, gerados por `n8n/build.js`. O N8n não lê nem grava tabela: só chama funções do banco.
1. **`00 · RPC Supabase`** (sub-workflow usado por todos): `POST {Supabase}/rest/v1/rpc/<fn>` com o header `apikey` (Secret key `n8n-bot`; **sem** `Authorization: Bearer`, porque a chave nova não é JWT). Devolve `{ status, body }` e não quebra o fluxo por HTTP 4xx.
2. **Motor** (`n8n/src/motor-conversa.js`): função pura, independente do provedor. Pede uma função do banco por vez e reaproveita os resultados já obtidos, então cada escrita roda uma vez só.
   - Ordem típica: pet shop do canal → `bot_registrar_mensagem` (entrada) → `bot_entrada` → `bot_responder_lembrete` (se SIM/NÃO) → passos do fluxo → `bot_salvar_estado` → `bot_envio`.
   - **Conflito:** `reservar_agendamento(..., 'bot')` com `code: "23P01"` (HTTP 400) vira "esse horário acabou de ser reservado" e uma nova lista de horários.
   - **fromMe:** `bot_registrar_fromme` ignora o eco das mensagens do próprio bot e pausa o bot quando a mensagem é do dono.
   - Bot desligado (`bot_config.ativo = false`) ou estado `humano`/`bloqueado`: silêncio.
3. **`05 · Canal de teste`:** chat do N8n (Chat Trigger, com usuário e senha) ligado ao mesmo motor. Só alcança pet shop com `bot_config.canal = 'teste'`. A resposta e os avisos ao dono aparecem no chat. Comandos: `#novo`, `#tel`, `#dono` (simula o dono respondendo), `#devolver`, `#lembrete`, `#estado` e `#ajuda`.
4. **`01 · Bot conversa`, `02 · Lembretes 24h` e `03 · Conexão WhatsApp`:** escritos para a Z-API clássica; serão adaptados ao provedor escolhido (leitura do webhook, envio, alerta de queda e, na API oficial, lembrete por template). **`04 · Erros`** independe do canal.

- **Simulação:** `n8n/test/simular.js` roda conversas completas contra um Postgres com o schema (11 cenários OK em 06/11/2026, inclusive o canal de teste). Ao mudar o motor: simular, rodar o build e reimportar os workflows que o usam. Não editar o código dentro do N8n.
- **Avisos ao dono** (transbordo, cancelamento, agenda de amanhã em bloqueio) vão para `bot_config.telefone_avisos`, o celular pessoal do dono, diferente do número do bot. Sem esse número, o aviso não sai. Na API oficial, esses avisos ficam fora da janela de 24 h: considerar e-mail ou o painel.'''),

  ("9. Lembretes",
   r'''**Lembretes:** cron diário às 10h chama `lembretes_pendentes()`, que já filtra os agendamentos `confirmado` de amanhã no fuso de cada pet shop, só de tutores que aceitam mensagens e que ainda não receberam o lembrete. Envia SIM/NÃO, grava em `lembretes` e `mensagens_log`, atualiza o status e avisa o dono em caso de cancelamento. Na API oficial, o lembrete é um modelo de mensagem de "utilidade" aprovado pela Meta.''',
   r'''**Lembretes (CM-02):** cron diário às 10h (fuso America/Sao_Paulo) chama `lembretes_pendentes()`. Ela devolve os agendamentos que atendem a todos estes filtros:
- `confirmado` e marcado para amanhã no fuso de cada pet shop;
- pet shop com bot ligado;
- tutor que aceita mensagens;
- ainda sem lembrete enviado;
- **fora de período bloqueado**;
- dentro do **limite semanal de mensagens automáticas** (`limite_msgs_auto_semana`, CM-10).

Cada lembrete é marcado (`bot_lembrete_marcar`) antes do envio, para um cron duplicado não mandar duas vezes. Se o envio falhar, `bot_lembrete_desmarcar` libera para o dia seguinte. A resposta é tratada pelo bot com `bot_responder_lembrete` (lembrete sem resposta das últimas 36 h): SIM confirma; NÃO cancela e avisa o dono (CM-03). Na API oficial, o lembrete é um modelo de mensagem de "utilidade" aprovado pela Meta. No canal de teste, o comando `#lembrete` faz o mesmo para o telefone da conversa.
- **Agendamento em período bloqueado (decidido em 06/11/2026):** não recebe lembrete. No mesmo cron, o dono recebe no celular de avisos a lista dos agendamentos de amanhã que caem em feriado ou folga, com o telefone de cada tutor, e resolve pelo painel. O bot **não** avisa o tutor nem oferece remarcação no MVP (remarcação é BT-07, F2).

**Conexão (PL-03):** depende do provedor; o workflow `03` atual é da Z-API clássica. `bot_conexao_evento` grava `bot_config.conexao_status` e decide o alerta: na queda, de novo a cada 6 h enquanto continuar caído, e na volta. Alerta por e-mail (Resend, remetente `noreply@`) para `suporte@petcarehub.com.br`.

**Erros (PL-04):** o workflow `04 · Erros` é o Error Workflow dos outros. Grava em `fluxo_erros` (só a Harpia lê) e manda no máximo um e-mail por hora, por causa do teto de 100 e-mails/dia do Resend gratuito. Falha numa função do banco durante a conversa também é registrada, e o tutor recebe "tive um problema aqui; digite 4 para falar com a equipe".'''),

  ("12. Concluído: workflow",
   r'''- Workflow N8n montado. **Não testado; precisa ser adaptado ao schema rev. 3** (seção 9).''',
   r'''- **Bot reescrito para as funções do banco** (06/11/2026):
    - arquivos 13 a 16 e `aceite_bot.sql` (B1–B11 OK num Postgres 16 local com o schema 01–11);
    - workflows `n8n/00` a `05`, com o motor simulado em 11 cenários;
    - canal de teste no chat do N8n;
    - aceite pelo canal de teste aprovado em 08/11/2026 (testes 1 a 7 e 9).
    - Falta o provedor de WhatsApp (seção 7.1).'''),

  ("12. Próximos passos: item 10",
   r'''10. ◐ Reativar Supabase (✅) e Railway; adaptar o bot às funções do banco (seção 9) e guardar o token do canal no Vault.''',
   r'''10. ◐ Bot nas funções do banco: ✅ construído (06/11/2026) e ✅ aprovado pelo canal de teste em 08/11/2026 (testes 1 a 7 e 9; Railway novo, N8n 2.46.6 em US East, workflows `00`, `04` e `05`). Falta escolher o provedor de WhatsApp (seção 7.1), adaptar os workflows `01` a `03` e rodar os testes que dependem dele: 8 (queda da conexão), lembrete pelo cron das 10h e pausa disparada pelo celular.'''),

  ("12. Próximos passos: item 11",
   r'''11. Lembrete 24h, avisos ao dono, alerta de queda do WhatsApp.''',
   r'''11. ◐ Lembrete 24h, avisos ao dono, alerta de queda e log de erros: construídos com o item 10; o envio real depende do provedor.'''),

  ("12. Ordem definida",
   r'''5) **reativar o Railway em `n8n.` e adaptar o bot (Z-API) — próximo**.''',
   r'''5) **bot**: construído em 06/11 e aprovado pelo canal de teste em 08/11; provedor de WhatsApp em decisão (seção 7.1).'''),

  ("12. Decisões em aberto: bloqueio e itens novos",
   r'''- **Agendamento em período bloqueado:** hoje o painel avisa e marca, sem cancelar nem avisar o tutor. Decidir no passo 5 se o bot avisa o tutor e oferece remarcação. Até lá, `lembretes_pendentes` **não** filtra esses agendamentos, então o lembrete sairia para um dia bloqueado. Sugestão: não mandar lembrete de agendamento em bloqueio e avisar o dono.''',
   r'''- ✅ **Agendamento em período bloqueado** (06/11/2026): sem lembrete; o dono recebe a lista no celular de avisos às 10h da véspera; o bot não avisa o tutor nem oferece remarcação no MVP (seção 9).
- Campo "celular para avisos" (`bot_config.telefone_avisos`) no painel. Até existir, preencher por SQL no onboarding.
- Pets cadastrados pelo bot nascem como cão; o painel corrige a espécie. Perguntar a espécie no bot só se a POC pedir.
- Duas mensagens do mesmo tutor quase ao mesmo tempo rodam em paralelo no N8n e podem disputar o estado da conversa. Aceito no MVP; tratar se aparecer na POC.
- **Arquitetura para escalar (avaliada em 06/11/2026):** a proposta com gateway, RabbitMQ e Redis fica para quando houver gatilho. Até lá, o caminho é:
    1. adaptador por provedor (agora);
    2. N8n em modo fila quando o tempo de resposta do bot subir (~50–100 clientes);
    3. motor fora do N8n quando o laço de chamadas pesar;
    4. fila própria só com mais de um consumidor das mesmas mensagens.'''),

  ("13. Decisões superadas: linhas novas (no fim da tabela)",
   r'''| Texto "PetCare Hub" no topo dos e-mails | Logo em PNG servida pelo painel | E-mail não exibe SVG; identidade da marca nos e-mails |''',
   r'''| Texto "PetCare Hub" no topo dos e-mails | Logo em PNG servida pelo painel | E-mail não exibe SVG; identidade da marca nos e-mails |
| Z-API (QR Code) no MVP e na POC, decidida em 06/11/2026 | Canal em reavaliação; canal de teste enquanto isso | A Z-API virou Omni, só com API oficial da Meta |
| Menu fixo: 1) banho 2) tosa 3) banho+tosa 4) consultar 5) cancelar | 1) agendar 2) ver 3) cancelar 4) equipe; serviços listados do catálogo do pet shop | Serviços são personalizáveis por pet shop |
| Chaves do Supabase em variáveis do N8n (`SUPABASE_*`) | Credencial `supabase n8n-bot` com Secret key dedicada | N8n 2.x bloqueia `$env` nos nós; credencial é cifrada e revogável |
| "Confirmar se a chamada de função precisa de `Authorization: Bearer`" | Só o header `apikey` | A Secret key nova não é JWT |
| Workflow do bot com IF/Switch por estado e um HTTP por função | Motor em código (`n8n/src/motor-conversa.js`) + sub-workflow de RPC | Testável fora do N8n; uma fonte só; independente do provedor |
| `lembretes_pendentes` sem filtro de bloqueio nem de limite | Filtra bot desligado, bloqueio e limite semanal (CM-10) | Lembrete não sai para dia bloqueado |
| Envio lendo `bot_token(petshop)` | `bot_envio(petshop)`: canal, instância, token e celular de avisos | Uma chamada por envio |
| Reativar o Railway antigo | Railway refeito do zero | Workflow e conta antigos descartados |
| Nome do tutor nunca vai para outro pet shop | Vai com o consentimento de compartilhar dados do pet | Devolução do pet achado; cumprimento pelo nome (08/11/2026) |'''),
]

# Só depois de escolher o provedor (se for a Z-API clássica ou outro provedor com payload igual).
MESTRE_DEPOIS = [
  ("9. Z-API: título",
   r'''**Z-API (se mantida):**''',
   r'''**Provedor de WhatsApp:**'''),
  ("9. Z-API: campo da mensagem",
   r'''- **Confirmar no primeiro teste real** se o campo é `$json.message` ou `$json.body.message`.''',
   r'''- (Preencher com o campo do texto no webhook do provedor escolhido. Na Z-API clássica era `$json.body.text.message`; no Omni, `message.contents[0].message`.)'''),
  ("9. Z-API: webhooks",
   r'''- Webhooks: "Ao receber" com a URL do N8n; ignorar presença, status, grupos, imagem, vídeo, áudio e documento; manter texto e chats privados; **"Notificar enviadas por mim" ligado** (necessário para a pausa automática); **enfileiramento ativo**. Alerta de queda de conexão obrigatório no MVP.''',
   r'''- (Preencher com a configuração de webhooks do provedor escolhido.) Regras que valem para qualquer provedor: receber as mensagens enviadas pelo próprio número (pausa automática); não descartar áudio e imagem no provedor, porque o bot responde que só lê texto (BT-16); grupos e status são descartados no N8n; alerta de queda obrigatório no MVP.'''),
]

MAPA = [
  ("Status de entrega: linha do bot",
   r'''Próximo: bot pela Z-API''',
   r'''Aprovado no canal de teste (08/11): bot; provedor de WhatsApp em decisão'''),
  ("Status de entrega: observação da mesma linha",
   r'''Reativar o Railway em n8n. e adaptar o workflow às funções do banco''',
   r'''Arquivos 13 a 16 e workflows n8n/00 a 05, simulados contra o schema. TP-12 e TP-15 pelo bot (consentimento depois do 1º agendamento, SAIR/ATIVAR/REVOGAR). Aprovado pelo canal de teste em 08/11 (testes 1 a 7 e 9). Falta escolher o provedor de WhatsApp (a Z-API virou Omni, só API oficial) e rodar os testes que dependem dele. PL-10 em parte: canal e estado da conexão em bot_config'''),
  ("Ordem de construção: bot",
   r'''Próximo, pela Z-API: bot para agendar, consultar, cancelar, transbordo, escolha de pet já cadastrado e pausa automática''',
   r'''◐ Construído e aprovado pelo canal de teste em 08/11/2026 (provedor de WhatsApp em decisão): bot para agendar, consultar, cancelar, transbordo, escolha de pet já cadastrado e pausa automática'''),
  ("Ordem de construção: lembrete",
   r'''Lembrete 24h e avisos ao dono''',
   r'''◐ Lembrete 24h e avisos ao dono (construídos com o bot; envio real depende do provedor)'''),
  ("Ordem de construção: relatórios",
   r'''Relatórios das duas métricas e alertas de queda''',
   r'''Relatórios das duas métricas (podem começar antes do bot, para medir o no-show de partida) e alertas de queda (◐ construídos com o bot)'''),
  ("Decisões em aberto: canal",
   r'''✅ Canal de WhatsApp decidido (06/11/2026): Z-API no MVP e na POC; API oficial da Meta só ao escalar''',
   r'''Canal de WhatsApp em reavaliação (06/11/2026): a Z-API virou Omni, só API oficial. Comparar provedor não oficial, Evolution API e API oficial por provedor credenciado'''),
  ("M13 · PL-10",
   r'''Canal de WhatsApp por pet shop (Z-API no MVP; API oficial ao escalar) e estado da conexão''',
   r'''Canal de WhatsApp por pet shop (provedor em decisão; canal de teste enquanto isso) e estado da conexão'''),
  ("M4 · BT-02",
   r'''Menu numerado com fallback para resposta inválida''',
   r'''Menu numerado (agendar, ver, cancelar, falar com a equipe) com fallback para resposta inválida; serviços listados do catálogo do pet shop'''),
]
