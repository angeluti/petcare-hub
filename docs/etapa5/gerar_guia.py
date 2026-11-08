"""Gera o guia HTML da etapa 5 a partir do template, do SQL e das substituições.
Uso: python3 docs/etapa5/gerar_guia.py [URL_DO_GUIA]"""
import html, re, sys, pathlib, importlib.util

AQUI = pathlib.Path(__file__).parent
RAIZ = AQUI.parent.parent
url = sys.argv[1] if len(sys.argv) > 1 else '(link do guia "Bot PetCare no N8n")'

spec = importlib.util.spec_from_file_location('subs', AQUI / 'substituicoes.py')
subs = importlib.util.module_from_spec(spec); spec.loader.exec_module(subs)

def cod(rotulo, texto, classe=''):
    return (f'<div class="cod"><span class="rot {classe}">{rotulo}</span>'
            f'<button class="copiar" type="button">Copiar</button><pre><code>{html.escape(texto)}</code></pre></div>')

def trocas(lista, prefixo):
    out = []
    for i, (titulo, loc, sub) in enumerate(lista, 1):
        sub = sub.replace('{{GUIA_URL}}', url)
        cid = f'{prefixo}{i}'
        out.append(
            f'<details class="troca"><summary><span class="num">{i:02d}</span><span>{html.escape(titulo)}</span></summary>'
            f'<div class="par"><label class="feito-doc"><input type="checkbox" id="{cid}"> Aplicado</label>'
            f'{cod("LOCALIZAR", loc, "rot-loc")}{cod("SUBSTITUIR POR", sub, "rot-sub")}</div></details>')
    return '\n'.join(out)

t = (AQUI / 'guia_template.html').read_text()
t = t.replace('{{SQL13}}', html.escape((RAIZ / 'supabase/schema/13_bot_n8n.sql').read_text()))
t = t.replace('{{SQL14}}', html.escape((RAIZ / 'supabase/schema/14_canal_teste.sql').read_text()))
t = t.replace('{{SQL15}}', html.escape((RAIZ / 'supabase/schema/15_nome_compartilhado.sql').read_text()))
t = t.replace('{{SQL16}}', html.escape((RAIZ / 'supabase/schema/16_consentimento_optout.sql').read_text()))
t = t.replace('{{ACEITE}}', html.escape((RAIZ / 'supabase/testes/aceite_bot.sql').read_text()))
t = t.replace('{{MESTRE}}', trocas(subs.MESTRE, 'dm'))
t = t.replace('{{MAPA}}', trocas(subs.MAPA, 'mp'))
t = t.replace('{{MESTRE_DEPOIS}}', trocas(subs.MESTRE_DEPOIS, 'dd'))
# Passos e testes: só o título marca a caixa, para dar para selecionar o código sem desmarcar
t = re.sub(r'<label class="(passo|teste)">', r'<div class="\1">', t)
t = t.replace('</span></label>', '</span></div>')
saida = AQUI / 'bot-petcare-n8n.html'
saida.write_text(t)
print('ok', saida, len(t))
