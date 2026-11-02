# Site PetCare Hub — evolução do posicionamento e do SEO

> **Tarefa futura.** A V1 do site (02/11/2026) fala só de banho e tosa, porque é o que está
> disponível hoje. O produto final é um **hub de gestão do pet shop**. A cada módulo ou plano
> lançado, o site muda junto. Esta lista diz o que mudar e quando.

## Gatilho geral

Revisar o site **sempre que um módulo ou plano sair de "em breve"**. Fazer junto com a
atualização do documento-mestre e do Mapa de Funcionalidades.

## Por lançamento

| Gatilho | O que muda no site | Onde no código |
|---|---|---|
| **Administração lançada** (F2) | Título e descrição passam de "agendamento de banho e tosa" para "gestão do pet shop". Mensagem "sabe quanto sobra de cada banho" ganha destaque. Itens "em breve" dos planos viram "inclui". Rever preços (documento-mestre, seção 4). | `SITE.descricao` e título em `src/config.ts` e `src/layouts/Base.astro`; `PLANOS` e `MODULOS` em `src/data/conteudo.ts` |
| **Páginas por módulo** (SI-06, F2) | Uma página por módulo (`/spa`, `/administracao`, `/day-care`, `/vet`), cada uma com título, descrição e palavras-chave próprias. A home passa a apresentar o hub. | `src/pages/<modulo>.astro`, links no `Header.astro` e no `Modulos.astro` |
| **Day Care lançado** (F3) | Plano Day Care na seção de planos e nos dados estruturados (`offers`). Termos de busca de hotel e creche. | `PLANOS`, `MODULOS`, `index.astro` |
| **Vet / plano Clinic** (F3) | Plano Clinic; página voltada a clínicas; destaque ao prontuário compartilhado (só depois da revisão LGPD). | idem + política de privacidade |
| **Cases e depoimentos** (SI-07, F2) | Preencher `DEPOIMENTOS`; vídeo do bot em `VIDEO_DEMO`. | `src/data/conteudo.ts` |
| **Conteúdo para busca** (SI-08, F3) | Blog ou guias (ex.: como reduzir faltas, como precificar banho por porte). | coleção de conteúdo do Astro |
| **Contratação sem vendedor** (SI-09, F3) | Escolher plano e pagar no site; botões de plano deixam de ir para o WhatsApp. | novo fluxo; exige SMTP e cobrança |
| **Loja, app Meu Pet, marketplace** (F4) | Revisar a arquitetura do site inteiro (área do tutor, vitrine). | — |

## SEO: checklist a cada revisão

- Título e descrição da home refletem o escopo atual do hub.
- Cada módulo disponível tem página própria com título e descrição únicos.
- `offers` nos dados estruturados batem com os planos vendidos.
- Sitemap atualizado (automático) e reenviado no Search Console.
- `og.png` refeito se a mensagem principal mudar.
- Textos jurídicos cobrem os dados tratados pelos módulos novos (ex.: hospedagem, prontuário).
