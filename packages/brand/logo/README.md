# PetCare Hub — marca (símbolo "Selo")

Destino no repositório: `packages/brand/logo/`. Cores conforme `packages/brand/tokens.css`.

## Arquivos

| Arquivo | Uso |
|---|---|
| `simbolo-cor.svg` | Símbolo principal, sobre fundo claro |
| `simbolo-escuro.svg` | Símbolo sobre fundo escuro (`#0b1524`) |
| `simbolo-mono.svg` | Uma cor (marinho) sobre fundo branco: gravação a laser, carimbo, fax |
| `simbolo-mono-branco.svg` | Uma cor (branco) sobre fundo marinho |
| `icone-app.svg` | Símbolo com fundo espuma: foto de perfil, PWA, plaquinha |
| `icone-meupet.svg` / `icone-meupet-512.png` | Ícone do app Meu Pet (fundo toalha) |
| `favicon.svg`, `favicon.ico`, `favicon-16/32.png` | Favicon (versão simplificada, sem bigode e boca) |
| `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` | Ícones de app e manifest, fundo quadrado cheio |
| `simbolo-cor-1024.png` | Símbolo em alta, para documentos e redes |
| `logo-horizontal-{cor,escuro,mono,mono-branco}.svg` | Símbolo + "PetCare Hub", texto em curvas (não depende de fonte) |
| `logo-horizontal-cor-1200.png` | Logo horizontal em alta, para documentos e redes |
| `logo-selo-{cor,escuro,mono,mono-branco}.svg` | Logo + "by Harpia Tech Studio" (JetBrains Mono 500, identidade Harpia Tech): site, proposta, contrato |
| `modulo-{spa,administracao,daycare,vet,loja}-{cor,escuro}.svg` | Símbolo + nome do módulo |
| `logo-meupet.svg` | Ícone do Meu Pet + "meu pet" |
| `_gerar.py`, `_gerar_logos.py` | Scripts que geram tudo (fontTools + rsvg-convert; args: pasta, YoungSerif .ttf, JetBrainsMono .ttf instanciada em 500). Rodar de novo após mudar cor ou forma |

Os símbolos transparentes usam a cor do fundo previsto no contorno da orelha do cão e nos olhos. Por isso existe uma versão para fundo claro e outra para fundo escuro: não use `simbolo-cor.svg` sobre fundo escuro.

## Regras rápidas

- Área de proteção: no mínimo 1/4 da largura do símbolo em volta.
- Tamanho mínimo: 24 px com detalhes; abaixo disso, use `favicon.svg`.
- Não girar, não trocar as cores das metades, não separar cão e gato.
- A harpia não entra na logo. O selo "by Harpia Tech Studio" vai só em site, proposta e contrato.
- Módulos: símbolo + nome do módulo em Young Serif ("Spa", "Vet", "Day Care"...).

## Snippet para `<head>` (painel e site)

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1f5fd6">
```

`manifest.webmanifest` (painel):

```json
{
  "name": "PetCare Hub",
  "short_name": "PetCare Hub",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#1f5fd6",
  "background_color": "#f3f7f8",
  "display": "standalone"
}
```

Os arquivos de favicon vão em `apps/painel/public/` e `apps/site/public/`.

## Logo no site e no painel

Use `logo-horizontal-cor.svg` (ou `-escuro`) direto num `<img>`. Se preferir o texto como HTML (a Young Serif já é carregada):

```html
<a class="logo" href="/">
  <img src="/logo/simbolo-cor.svg" alt="" width="40" height="40">
  <span>PetCare <b>Hub</b></span>
</a>
```

```css
.logo { display: inline-flex; align-items: center; gap: .5rem; text-decoration: none; }
.logo span { font-family: var(--pc-fonte-display); font-size: 1.6rem; color: var(--pc-tinta); }
.logo b { font-weight: 400; color: var(--pc-azul); }
```
