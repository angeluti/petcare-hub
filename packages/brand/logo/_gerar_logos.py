"""Gera logo horizontal, lockups de módulos e versão com selo, com texto em curvas (Young Serif)."""
import os
import subprocess
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT, FONTE = sys.argv[1], sys.argv[2]
FONTE_MONO = sys.argv[3] if len(sys.argv) > 3 else None
sys.argv = [sys.argv[0], OUT]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_brand as bb  # noqa: E402  (regera os símbolos no mesmo diretório)

font = TTFont(FONTE)
upm = font["head"].unitsPerEm
cmap = font.getBestCmap()
gs = font.getGlyphSet()
hmtx = font["hmtx"]


def _kerning():
    """Lê pares de kerning do GPOS (PairPos formatos 1 e 2, feature 'kern')."""
    pares, classes = {}, []
    gpos = font["GPOS"].table
    idx = set()
    for fr in gpos.FeatureList.FeatureRecord:
        if fr.FeatureTag == "kern":
            idx.update(fr.Feature.LookupListIndex)
    for i in idx:
        lk = gpos.LookupList.Lookup[i]
        for st in lk.SubTable:
            if lk.LookupType == 9:
                st = st.ExtSubTable
            if getattr(st, "LookupType", 2) != 2 and lk.LookupType != 9:
                continue
            if not hasattr(st, "Format"):
                continue
            cov = st.Coverage.glyphs
            if st.Format == 1:
                for g1, ps in zip(cov, st.PairSet):
                    for pv in ps.PairValueRecord:
                        v = getattr(pv.Value1, "XAdvance", 0) or 0
                        if v:
                            pares.setdefault((g1, pv.SecondGlyph), v)
            elif st.Format == 2:
                classes.append((set(cov), st.ClassDef1.classDefs, st.ClassDef2.classDefs, st.Class1Record))
    return pares, classes


PARES, CLASSES = _kerning()


def kern(a, b):
    if (a, b) in PARES:
        return PARES[(a, b)]
    for cov, cd1, cd2, recs in CLASSES:
        if a in cov:
            c1, c2 = cd1.get(a, 0), cd2.get(b, 0)
            v = getattr(recs[c1].Class2Record[c2].Value1, "XAdvance", 0) or 0
            if v:
                return v
    return 0


def texto(s, x, y, tamanho, cor):
    """Converte texto em <path>; devolve (svg, largura)."""
    esc = tamanho / upm
    partes, cx, ant = [], 0.0, None
    for ch in s:
        g = cmap[ord(ch)]
        if ant:
            cx += kern(ant, g)
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (esc, 0, 0, -esc, x + cx * esc, y)))
        d = pen.getCommands()
        if d:
            partes.append(d)
        cx += hmtx[g][0]
        ant = g
    return f'<path d="{" ".join(partes)}" fill="{cor}"/>', cx * esc


def texto_mono(s, x, y, tamanho, cor):
    """Texto em JetBrains Mono (identidade Harpia Tech), sem kerning."""
    if not FONTE_MONO:
        return texto(s, x, y, tamanho, cor)
    fm = TTFont(FONTE_MONO)
    esc = tamanho / fm["head"].unitsPerEm
    cm, gsm, hm = fm.getBestCmap(), fm.getGlyphSet(), fm["hmtx"]
    partes, cx = [], 0.0
    for ch in s:
        g = cm[ord(ch)]
        pen = SVGPathPen(gsm)
        gsm[g].draw(TransformPen(pen, (esc, 0, 0, -esc, x + cx * esc, y)))
        if pen.getCommands():
            partes.append(pen.getCommands())
        cx += hm[g][0]
    return f'<path d="{" ".join(partes)}" fill="{cor}"/>', cx * esc


CORES_TEXTO = {
    "cor": ("#10213a", "#1f5fd6", "#4c6078"),
    "escuro": ("#e6edf6", "#6f9cf3", "#9fb2c8"),
    "mono": ("#10213a", "#10213a", "#10213a"),
    "mono-branco": ("#ffffff", "#ffffff", "#ffffff"),
}
TAM = 46          # cap height ~34,5 un., casa com a face do símbolo (26–88)
BASE = 74
X0 = 98


def montar(nome_arq, partes, largura, altura, titulo, fundo=None, view_y=0):
    corpo = []
    if fundo:
        corpo.append(f'<rect y="{view_y}" width="{largura}" height="{altura}" fill="{fundo}"/>')
    corpo += partes
    svg = bb.svg(corpo, titulo, view=f"0 {view_y} {largura:.0f} {altura}")
    return bb.salvar(nome_arq, svg)


def png(svg_path, nome, largura):
    subprocess.run(["rsvg-convert", "-w", str(largura), "-o", os.path.join(OUT, nome), svg_path], check=True)


# 1) Logo horizontal
for var, (c_tinta, c_hub, c_sub) in CORES_TEXTO.items():
    p1, w1 = texto("PetCare ", X0, BASE, TAM, c_tinta)
    p2, w2 = texto("Hub", X0 + w1, BASE, TAM, c_hub)
    larg = X0 + w1 + w2 + 12
    caminho = montar(f"logo-horizontal-{var}.svg", bb.simbolo(bb.PALETAS[var]) + [p1, p2], larg, 100, "PetCare Hub")
    if var == "cor":
        png(caminho, "logo-horizontal-cor-1200.png", 1200)

    # 2) Com selo "by Harpia Tech Studio" (para site, proposta e contrato)
    p3, w3 = texto_mono("by Harpia Tech Studio", X0 + 2, BASE + 22, 11.5, c_sub)
    montar(f"logo-selo-{var}.svg", bb.simbolo(bb.PALETAS[var]) + [p1, p2, p3],
           max(larg, X0 + w3 + 12), 104, "PetCare Hub by Harpia Tech Studio")

# 3) Módulos: símbolo + nome do módulo
MODULOS = {"spa": "Spa", "administracao": "Administração", "daycare": "Day Care", "vet": "Vet", "loja": "Loja"}
for slug, nome in MODULOS.items():
    for var in ["cor", "escuro"]:
        c_tinta = CORES_TEXTO[var][0]
        p, w = texto(nome, X0, BASE, TAM, c_tinta)
        montar(f"modulo-{slug}-{var}.svg", bb.simbolo(bb.PALETAS[var]) + [p], X0 + w + 12, 100, f"PetCare Hub {nome}")

# 4) Meu Pet: ícone + nome (o app usa tom mais leve; nome em Young Serif minúsculo)
p, w = texto("meu pet", X0 + 14, BASE, TAM, "#10213a")
montar("logo-meupet.svg", bb.simbolo(bb.PALETAS["meupet"], com_fundo=True) + [p], X0 + 14 + w + 12, 100, "Meu Pet")

os.remove(os.path.join(OUT, "logo-horizontal-provisorio.svg")) if os.path.exists(os.path.join(OUT, "logo-horizontal-provisorio.svg")) else None
print("ok", len(PARES), "pares,", len(CLASSES), "subtabelas de classe")
