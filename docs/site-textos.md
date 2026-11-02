# Site PetCare Hub — textos da página (rev. 1, 02/11/2026)

Texto final que está no código (`apps/site`). Para revisar sem abrir o código.
Fonte das listas: `src/data/conteudo.ts`. Regra de tom: vender resultado, não tecnologia.

---

## SEO

- **Título:** PetCare Hub · Agendamento de banho e tosa pelo WhatsApp
- **Descrição:** Agendamento de banho e tosa pelo WhatsApp, agenda única e lembrete na véspera para pet shops. Atende seus clientes enquanto você cuida dos pets.
- **Imagem de compartilhamento:** `public/og.png`

## Topo

PetCare Hub · by Harpia Tech Studio · Como funciona · Módulos · Planos · Dúvidas · **Entrar** (→ app.petcarehub.com.br) · **Agendar demonstração** (→ WhatsApp comercial)

## 1. Abertura

- Rótulo: Para pet shops de banho e tosa
- **Título:** Seu pet shop marca banho e tosa até de madrugada.
- Texto: O PetCare Hub responde seus clientes no WhatsApp com o nome do seu pet shop, oferece só os horários livres e lembra o tutor na véspera. Você cuida dos pets.
- Botões: Agendar demonstração · Ver como funciona
- Garantias: Usa o WhatsApp que você já tem · Implantação por videochamada · Para qualquer cidade do Brasil
- Conversa de exemplo (Pet Feliz, atendente Luna, domingo 23:47):
  - Tutor: oi, tem horário pra banho na terça? é pro Thor
  - Luna: Oi! Eu sou a Luna, assistente do Pet Feliz. Para o Thor (porte M), na terça tenho: 1) 09:00 2) 10:30 3) 14:00
  - Tutor: 1
  - Luna: Pronto! Banho do Thor na terça às 09:00, R$ 45,00. Na véspera eu te lembro por aqui.
  - Legenda: **23:47** Domingo. O pet shop está fechado e o horário de terça já está na agenda.

## 2. O que muda no seu dia

**Menos mensagem para responder, mais pet na agenda.**

- **Para de perder cliente no domingo.** Quem manda mensagem à noite ou no fim de semana recebe resposta na hora e sai com o horário marcado, em vez de procurar outro pet shop.
- **Menos horário vazio por esquecimento.** Na véspera, o tutor recebe o lembrete e responde SIM ou NÃO. Quem desiste libera o horário a tempo de outro cliente ocupar.
- **Uma agenda só, sem marcar dois no mesmo horário.** O WhatsApp e o balcão consultam a mesma agenda, com a duração real de cada serviço por porte. O sistema recusa o horário que acabou de ser ocupado.

## 3. Como funciona

**Do "oi" no WhatsApp ao pet entregue, na mesma agenda.** Acompanhe o banho do Thor, marcado num domingo à noite.

| # | Quando | Etapa | Texto |
|---|---|---|---|
| 01 | Dom · 23:47 | O tutor pede pelo WhatsApp | O atendente responde na hora, com o nome do seu pet shop, e mostra só horários que existem. |
| 02 | Dom · 23:49 | O horário entra na agenda | Já reservado para o profissional certo. Bot e balcão veem a mesma agenda, sem marcar duas vezes. |
| 03 | Seg · 10:00 | Lembrete na véspera | O tutor responde SIM ou NÃO. Se cancelar, você é avisado e o horário volta a ficar livre. |
| 04 | Ter · 09:00 | Check-in | O pet chega, a equipe marca a entrada e já vê porte, alergias e observações. |
| 05 | Ter · 09:05 | Banho e tosa | Cada profissional vê a própria fila do dia. |
| 06 | Ter · 10:20 | Pet pronto | O status muda no painel e a recepção já sabe que pode chamar o tutor. |
| 07 | Ter · 10:45 | Check-out | Pagamento registrado (Pix, cartão ou dinheiro) e o atendimento vai para o histórico do pet. |
| 08 | Depois | Próximo banho | O histórico fica guardado e o próximo pedido começa mais rápido. |

## 4. Veja funcionando (espaço do vídeo)

- **Sem vídeo (hoje):** "Quer ver ao vivo? Mande um 'oi'." — Na demonstração você conversa com o atendente como se fosse um cliente, marca um horário e vê a agenda do painel mudar na hora. Ao lado, uma agenda ilustrativa da Ana na terça.
- **Com vídeo:** "Um agendamento do começo ao fim." — Um tutor marca banho e tosa pelo WhatsApp, do primeiro "oi" à confirmação.

## 5. Do jeito do seu pet shop

**Configurado com os seus serviços, preços e equipe.**

- **O atendente tem o nome que você escolher.** "Oi, eu sou a Luna, assistente do Pet Feliz." O cliente conversa com o seu pet shop.
- **Você assume a conversa quando quiser.** Respondeu pelo celular, o atendente para naquela conversa. Nada de número novo.
- **Agenda por profissional.** Cada um com os serviços que faz. Quem trabalha com dois pets ao mesmo tempo começa o segundo enquanto o primeiro seca.
- **Plaquinha com QR Code.** Feita a laser, com o nome do pet. O QR abre a ficha que o tutor escolher mostrar.
- Tabela "Exemplo de tabela por porte" (seed): Banho 35/45/60/80 · Tosa 40/55/70/90 · Banho e tosa 65/85/110/145 · Hidratação 25/35/45/60.

## 6. Módulos

**Começa pelo banho e tosa. Cresce com o seu pet shop.** Cada módulo liga no mesmo painel, com os mesmos clientes e pets.

| Módulo | Cobre | Status | Texto |
|---|---|---|---|
| Spa | Banho e tosa | Disponível | Agenda, atendente no WhatsApp, lembretes, operação do dia e pagamento. O cliente marca sozinho e você só confere. |
| Administração | Estoque, compras e financeiro | Em breve | Você sabe quanto sobra de cada banho, com insumo, água, energia e comissão na conta. |
| Day Care | Hotel e creche | Em breve | Diárias, baias, presença na creche e o diário do hóspede enviado ao tutor. |
| Vet | Clínica veterinária | Em breve | Prontuário, vacinas e receitas na mesma linha do tempo do pet que o banho já registra. |

## 7. Planos

**Mensalidade fixa, sem cobrança por mensagem.** A implantação tem valor único, combinado na demonstração.

**Essencial — R$ 197/mês** · Para quem atende sozinho · 1 profissional, até 80 agendamentos por mês
- Atendente no WhatsApp com o nome do seu pet shop
- Agenda do dia e da semana, igual para você e para o atendente
- Confirmação e lembrete na véspera
- Tutores e pets cadastrados, com histórico
- Check-in, check-out e registro do pagamento
- 1 plaquinha com QR Code para o pet
- Entra quando lançar: Caixa e contas a receber

**Profissional — R$ 397/mês** (destaque) · Para a equipe de banho e tosa · Até 3 profissionais, agendamentos ilimitados
- Tudo do Essencial
- Agenda por profissional, com entrada escalonada
- Preço e duração por porte (P, M, G, GG)
- 3 plaquinhas com QR Code
- Entra quando lançar: Administração (estoque, compras, financeiro e custo de cada banho)

Nota: Tem hotel, creche ou clínica? Os planos Day Care e Clinic estão a caminho.

## 8. Depoimentos

Escondido até haver depoimento autorizado. Título previsto: "Pet shops que pararam de responder WhatsApp de madrugada."

## 9. Dúvidas

1. **Preciso de outro número de WhatsApp?** Não. O atendente usa o número que o seu pet shop já tem.
2. **E quando eu quiser responder pessoalmente?** Responda pelo celular; o atendente fica em silêncio naquela conversa por algumas horas. No painel há um botão para devolver a conversa a ele.
3. **O atendente pode marcar dois pets no mesmo horário por engano?** Não. A agenda é uma só e o sistema recusa um horário que acabou de ser ocupado. Encaixe, só você, pelo painel.
4. **Funciona na minha cidade?** Sim. É online; implantação e treinamento por videochamada.
5. **Como funciona a implantação?** Configuramos serviços, preços por porte, horários, equipe e nome do atendente, conectamos o WhatsApp e treinamos você. Valor único, combinado na demonstração.
6. **E os dados dos meus clientes?** Ficam separados por pet shop; nenhum outro estabelecimento vê seus clientes, preços ou histórico de banho. Segue a LGPD.

## 10. Chamada final

**Veja seu pet shop atendendo sozinho.** Uma demonstração de 5 minutos pelo WhatsApp, com os serviços do seu pet shop. [Agendar demonstração]

## Rodapé

PetCare Hub · by Harpia Tech Studio · "Atendimento e gestão para pet shops. Sede em Valinhos-SP, atendimento em todo o Brasil." · Termos de uso · Política de privacidade · WhatsApp comercial · © 2026 Harpia Tech Studio.

---

## Pontos de atenção nos textos

- **"Usa o WhatsApp que você já tem" e "Nada de número novo":** valem para Z-API (dispositivo secundário) e para a API oficial com coexistência. Se o canal escolhido mudar isso, revisar.
- **"Mensalidade fixa, sem cobrança por mensagem":** compromisso comercial. Com a API oficial, o custo por mensagem (~R$45/mês por pet shop, estimativa) fica com a Harpia.
- **Lembrete, atendente e plaquinha** estão no escopo do MVP, mas o bot ainda não foi testado. Não fazer prospecção ativa com o site antes de o bot rodar na POC.
- **Preços da tabela por porte** são o seed, rotulados como exemplo.
