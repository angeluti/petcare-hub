# PetCare Hub · Painel do pet shop

`app.petcarehub.com.br` — SPA estática (Vite + React + TypeScript) sobre o Supabase.
A segurança está na RLS do banco (schema rev. 3, arquivo 07). O navegador só tem a Publishable key.

## Rodar local

```bash
npm install
cp .env.example .env.local          # preencha URL e Publishable key
npx supabase login
npx supabase gen types typescript --project-id <project-ref> --schema public > src/lib/database.types.ts
npm run dev                          # http://localhost:5173
npm run typecheck                    # depois de gerar os tipos
```

## Estrutura

```
src/
  main.tsx                 Providers (React Query, Router, sessão, avisos)
  App.tsx                  Login → pet shop → rotas liberadas pelo plano/papel
  estilo.css               Tokens de design + tema escuro automático
  contexto/
    Sessao.tsx             Supabase Auth (login, recuperação de senha)
    PetshopAtual.tsx       Pet shops do usuário, papel, minhas_funcionalidades
  componentes/
    Layout.tsx             Menu montado pelas funcionalidades do plano
    Cadastro.tsx           FormTutor / FormPet (RPCs cadastrar_tutor / cadastrar_pet)
    ui.tsx                 Modal, avisos, campos
  lib/
    supabase.ts            Cliente tipado + helper dado()
    database.types.ts      PLACEHOLDER → substitua pelos tipos gerados
    consultas.ts           Leituras (useQuery) com chave por pet shop
    acoes.ts               Escritas: reservar, status, remarcar, check-in/out
    erros.ts               Códigos do Postgres → mensagens (23P01 = horário ocupado)
    tempo.ts               Datas no fuso do pet shop (date-fns-tz)
    tipos.ts, formato.ts
  paginas/
    Login.tsx              Login + "esqueci a senha" + redefinir senha
    Agenda.tsx             Dia (colunas por profissional) e semana
    agenda/NovoAgendamento.tsx   tutor → pet → serviços → dia → horário (motor do banco)
    agenda/DetalheAgendamento.tsx  confirmar, remarcar, cancelar, não veio, check-in/out
    Clientes.tsx           Tutores e pets (cadastro por RPC, edição dos vínculos)
    Configuracao.tsx       Serviços e preços por porte, horários, profissionais, bot, regras
supabase/
  aceite_painel.sql        Teste de aceite no banco (simula os dois donos)
```

## Regras importantes

- **Conflito de horário:** o banco devolve `code = '23P01'` com **HTTP 400** (PostgREST 12 e 14),
  não 409. O painel trata pelo código (`lib/erros.ts`). O bot no N8n deve fazer o mesmo.
- **Tutor e pet só por RPC** (`cadastrar_tutor`, `cadastrar_pet`). Não existe INSERT direto liberado.
- **Datas no fuso do pet shop** (`petshops.fuso`), nunca no do navegador.
- **Encaixe** (passa por cima da capacidade e do horário) só para dono/gerente.

## Deploy

Cloudflare Pages: build `npm run build`, saída `dist`, variáveis `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY`. Sem `404.html`, o Pages já serve o `index.html` para
qualquer rota (comportamento de SPA). Detalhes no guia.
