"""Gera o pacote de marca do PetCare Hub (símbolo "Selo") em SVG e PNG."""
import os
import subprocess
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

# Paletas (tokens.css)
PALETAS = {
    # fundo: cor do fundo onde o símbolo vai (usada no contorno da orelha e nos olhos)
    "cor": dict(fundo="#ffffff", cao="#1f5fd6", orelha="#174aa8", gato="#10213a",
                focinho="#e2ecfb", nariz="#f2b83a", boca_cao="#10213a", traco_gato="#ffffff"),
    "escuro": dict(fundo="#0b1524", cao="#6f9cf3", orelha="#9bbcf8", gato="#e6edf6",
                   focinho="#e6edf6", nariz="#e8b04c", boca_cao="#0b1524", traco_gato="#0b1524"),
    "mono": dict(fundo="#ffffff", cao="#10213a", orelha="#10213a", gato="#10213a",
                 focinho="#ffffff", nariz="#10213a", boca_cao="#10213a", traco_gato="#ffffff"),
    "mono-branco": dict(fundo="#10213a", cao="#ffffff", orelha="#ffffff", gato="#ffffff",
                        focinho="#10213a", nariz="#ffffff", boca_cao="#ffffff", traco_gato="#10213a"),
    "meupet": dict(fundo="#f2b83a", cao="#10213a", orelha="#10213a", gato="#ffffff",
                   focinho="#ffffff", nariz="#f2b83a", boca_cao="#10213a", traco_gato="#10213a",
                   olho_cao="#f2b83a"),
}

# Geometria refinada (viewBox 0 0 100 100)
ORELHA_GATO = "M60 27L75 11L80 33Z"
METADE_CAO = "M50 26H32Q18 26 18 40V74Q18 88 32 88H50Z"
METADE_GATO = "M50 26H68Q82 26 82 40V74Q82 88 68 88H50Z"
FOCINHO = "M50 61C41 61 33 65 33 72C33 79 41 82 50 82Z"
ORELHA_CAO = "M40 27C30 21 15 23 11 35C8 46 9 59 14 64C19 68 24 63 24 55C24 44 30 33 40 27Z"
NARIZ = "M44.5 62.5Q50 60.5 55.5 62.5Q53.5 68 50 68.5Q46.5 68 44.5 62.5Z"


def simbolo(p, detalhe="completo", com_fundo=False, raio_fundo=22):
    """detalhe: completo | medio (sem boca) | favicon (silhueta, focinho e nariz)."""
    f = p
    olho_cao = f.get("olho_cao", f["fundo"])
    partes = []
    if com_fundo:
        partes.append(f'<rect width="100" height="100" rx="{raio_fundo}" fill="{f["fundo"]}"/>')
    partes.append(f'<path d="{ORELHA_GATO}" fill="{f["gato"]}" stroke="{f["gato"]}" stroke-width="5" stroke-linejoin="round"/>')
    partes.append(f'<path d="{METADE_CAO}" fill="{f["cao"]}"/>')
    partes.append(f'<path d="{METADE_GATO}" fill="{f["gato"]}"/>')
    partes.append(f'<path d="{FOCINHO}" fill="{f["focinho"]}"/>')
    sw = 3.2 if detalhe == "favicon" else 2.5
    partes.append(f'<path d="{ORELHA_CAO}" fill="{f["orelha"]}" stroke="{f["fundo"]}" stroke-width="{sw}" stroke-linejoin="round"/>')
    if detalhe == "favicon":
        partes.append(f'<circle cx="38" cy="49" r="5" fill="{olho_cao}"/>')
        partes.append(f'<ellipse cx="63" cy="49" rx="3.8" ry="5.4" fill="{f["traco_gato"]}"/>')
        partes.append(f'<path d="M43.5 62Q50 59.5 56.5 62Q54 69.5 50 70Q46 69.5 43.5 62Z" fill="{f["nariz"]}"/>')
    else:
        partes.append(f'<circle cx="38" cy="50" r="4" fill="{olho_cao}"/>')
        partes.append(f'<ellipse cx="63" cy="50" rx="3" ry="4.6" fill="{f["traco_gato"]}"/>')
        partes.append(f'<path d="M64 66L80 63M64 71L80 73" stroke="{f["traco_gato"]}" stroke-width="2" stroke-linecap="round"/>')
        if detalhe == "completo":
            partes.append(f'<path d="M50 68.5V72M50 72Q46.5 75.5 43 72" fill="none" stroke="{f["boca_cao"]}" stroke-width="1.8" stroke-linecap="round"/>')
            partes.append(f'<path d="M50 72Q53.5 75.5 57 72" fill="none" stroke="{f["traco_gato"]}" stroke-width="1.8" stroke-linecap="round"/>')
        nariz_stroke = ' stroke="#ffffff" stroke-width="1.2"' if f["nariz"] == f["gato"] else ""
        partes.append(f'<path d="{NARIZ}" fill="{f["nariz"]}"{nariz_stroke}/>')
    return partes


def svg(partes, titulo, view="0 0 100 100"):
    corpo = "\n  ".join(partes)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="{titulo}">\n'
            f'  <title>{titulo}</title>\n  {corpo}\n</svg>\n')


def salvar(nome, conteudo):
    caminho = os.path.join(OUT, nome)
    with open(caminho, "w", encoding="utf-8") as fh:
        fh.write(conteudo)
    return caminho


def png(svg_path, png_name, tamanho):
    subprocess.run(["rsvg-convert", "-w", str(tamanho), "-h", str(tamanho), "-o",
                    os.path.join(OUT, png_name), svg_path], check=True)


# 1) Símbolos (fundo transparente; o contorno da orelha usa a cor do fundo previsto)
TITULO = "PetCare Hub"
for nome in ["cor", "escuro", "mono", "mono-branco"]:
    salvar(f"simbolo-{nome}.svg", svg(simbolo(PALETAS[nome]), TITULO))

# 2) Ícones com fundo (app, perfil, plaquinha)
salvar("icone-app.svg", svg(simbolo(PALETAS["cor"] | {"fundo": "#f3f7f8"}, com_fundo=True), TITULO))
salvar("icone-meupet.svg", svg(simbolo(PALETAS["meupet"], com_fundo=True), "Meu Pet"))

# 3) Favicon simplificado
fav = salvar("favicon.svg", svg(simbolo(PALETAS["cor"], detalhe="favicon"), TITULO))
fav_fundo = salvar("_favicon-fundo.svg", svg(simbolo(PALETAS["cor"] | {"fundo": "#f3f7f8"}, detalhe="medio", com_fundo=True, raio_fundo=0), TITULO))

# 4) PNGs
png(fav, "favicon-32.png", 32)
png(fav, "favicon-16.png", 16)
png(fav_fundo, "apple-touch-icon.png", 180)
png(fav_fundo, "icon-192.png", 192)
png(fav_fundo, "icon-512.png", 512)
png(os.path.join(OUT, "icone-meupet.svg"), "icone-meupet-512.png", 512)
png(os.path.join(OUT, "simbolo-cor.svg"), "simbolo-cor-1024.png", 1024)
subprocess.run(["convert", os.path.join(OUT, "favicon-16.png"), os.path.join(OUT, "favicon-32.png"),
                os.path.join(OUT, "favicon.ico")], check=True)
os.remove(fav_fundo)
print("ok")
