#!/usr/bin/env python3
"""
Empaqueta todo el sitio en un único archivo HTML autónomo.

    python3 tools/empaquetar.py            -> hotel-almara.html

El resultado no depende de ningún otro archivo: los estilos, el JavaScript y
las quince ilustraciones viajan dentro. Sirve para enviarlo como adjunto de un
solo archivo o para publicarlo donde solo se admite una página.

Las ocho páginas conviven en el mismo documento y un enrutador por hash muestra
una cada vez (#/, #/reserva, #/guias/…), reescribiendo los enlaces internos.
La cabecera y el pie se comparten en lugar de repetirse ocho veces.
"""
import base64
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (archivo, ruta del enrutador, título)
PAGINAS = [
    ('index.html', '/', 'Hotel Almara — Donde el mar te espera'),
    ('reserva.html', '/reserva', 'Reservar — Hotel Almara'),
    ('habitaciones.html', '/habitaciones', 'Habitaciones — Hotel Almara'),
    ('guias.html', '/guias', 'Guías locales — Hotel Almara'),
    ('guias/mejores-playas-cerca-de-tarifa.html', '/guias/playas',
     'Las 5 mejores playas cerca de Tarifa — Hotel Almara'),
    ('guias/donde-comer-en-tarifa.html', '/guias/comer',
     'Dónde comer en Tarifa — Hotel Almara'),
    ('guias/actividades-en-tarifa.html', '/guias/actividades',
     'Kitesurf, senderismo y Tánger — Hotel Almara'),
    ('guias/como-llegar-y-moverse.html', '/guias/llegar',
     'Cómo llegar y moverse — Hotel Almara'),
]

# Enlaces del sitio -> rutas del enrutador.
RUTAS = {
    'index.html': '/',
    'reserva.html': '/reserva',
    'habitaciones.html': '/habitaciones',
    'guias.html': '/guias',
    'guias/mejores-playas-cerca-de-tarifa.html': '/guias/playas',
    'guias/donde-comer-en-tarifa.html': '/guias/comer',
    'guias/actividades-en-tarifa.html': '/guias/actividades',
    'guias/como-llegar-y-moverse.html': '/guias/llegar',
}


def leer(ruta):
    with open(os.path.join(RAIZ, ruta), encoding='utf-8') as f:
        return f.read()


def imagenes():
    """Cada SVG como data URI, listo para incrustar."""
    carpeta = os.path.join(RAIZ, 'assets', 'img')
    salida = {}
    for nombre in sorted(os.listdir(carpeta)):
        if not nombre.endswith('.svg'):
            continue
        with open(os.path.join(carpeta, nombre), 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('ascii')
        salida[nombre] = 'data:image/svg+xml;base64,' + b64
    return salida


def normalizar(destino, origen):
    """Resuelve un href relativo a la página que lo contiene."""
    if destino.startswith(('http', 'mailto:', 'tel:', 'data:')):
        return None
    base = os.path.dirname(origen)
    return os.path.normpath(os.path.join(base, destino)).replace(os.sep, '/')


def reescribir_enlaces(html, origen):
    """Convierte los enlaces entre páginas en rutas del enrutador."""
    def sustituir(m):
        href = m.group(1)
        if href.startswith(('http', 'mailto:', 'tel:', 'data:')):
            return m.group(0)

        # Ancla dentro de la misma página.
        if href.startswith('#'):
            if href == '#':
                return m.group(0)
            ruta = RUTAS.get(origen, '/')
            return 'href="#%s?ir=%s"' % (ruta, href[1:])

        camino, _, resto = href.partition('#')
        camino, _, consulta = camino.partition('?')
        destino = normalizar(camino, origen)
        if destino not in RUTAS:
            return m.group(0)

        ruta = RUTAS[destino]
        partes = []
        if consulta:
            partes.append(consulta)
        if resto:
            partes.append('ir=' + resto)
        return 'href="#%s%s"' % (ruta, ('?' + '&'.join(partes)) if partes else '')

    html = re.sub(r'href="([^"]+)"', sustituir, html)
    # El buscador del hero navega mediante data-navega, no mediante href.
    html = re.sub(r'data-navega="([^"]+)"',
                  lambda m: 'data-navega="#%s"' % RUTAS.get(normalizar(m.group(1), origen) or '', '/reserva'),
                  html)
    return html


def incrustar_imagenes(html, origen, imgs):
    """Sustituye rutas de imagen por sus data URI."""
    def por_nombre(m):
        entero, ruta = m.group(0), m.group(2)
        nombre = os.path.basename(ruta)
        if nombre in imgs:
            return entero.replace(ruta, imgs[nombre])
        return entero
    html = re.sub(r'(src=")([^"]*assets/img/[^"]+)"', lambda m: 'src="%s"' % imgs.get(
        os.path.basename(m.group(2)), m.group(2)), html)
    html = re.sub(r"(url\(')([^']*assets/img/[^']+)'", lambda m: "url('%s'" % imgs.get(
        os.path.basename(m.group(2)), m.group(2)), html)
    return html


def extraer_main(html):
    inicio = html.index('<main')
    inicio = html.index('>', inicio) + 1
    fin = html.rindex('</main>')
    return html[inicio:fin]


def main():
    imgs = imagenes()
    css = leer('assets/css/almara.css')
    js_comun = leer('assets/js/almara.js')
    js_reserva = leer('assets/js/reserva.js')

    # El JS construye rutas de imagen a mano: las apuntamos al mapa incrustado.
    js_comun = js_comun.replace(
        "var avatar = base + 'assets/img/agente-avatar.svg';",
        "var avatar = window.ALMARA_IMG['agente-avatar.svg'];")
    js_reserva = js_reserva.replace(
        "'  <div class=\"opcion__medio\"><img src=\"assets/img/' + hab.imagen + '\" alt=\"'",
        "'  <div class=\"opcion__medio\"><img src=\"' + window.ALMARA_IMG[hab.imagen] + '\" alt=\"'")
    js_reserva = js_reserva.replace(
        "$('#resumen-imagen').src = 'assets/img/' + hab.imagen;",
        "$('#resumen-imagen').src = window.ALMARA_IMG[hab.imagen];")

    # Cabecera y pie se toman una sola vez de la portada.
    portada = leer('index.html')
    cabecera = portada[portada.index('<header'):portada.index('</header>') + len('</header>')]
    pie = portada[portada.index('<footer'):portada.index('</footer>') + len('</footer>')]
    cabecera = incrustar_imagenes(reescribir_enlaces(cabecera, 'index.html'), 'index.html', imgs)
    pie = incrustar_imagenes(reescribir_enlaces(pie, 'index.html'), 'index.html', imgs)

    secciones = []
    for archivo, ruta, titulo in PAGINAS:
        html = leer(archivo)
        cuerpo = extraer_main(html)
        cuerpo = reescribir_enlaces(cuerpo, archivo)
        cuerpo = incrustar_imagenes(cuerpo, archivo, imgs)
        clase = 'pagina'
        # reserva.html trae su <main class="reserva"> con estilos propios.
        m = re.search(r'<main[^>]*class="([^"]*)"', html)
        if m:
            clase += ' ' + m.group(1)
        secciones.append(
            '<div class="%s" data-ruta="%s" data-titulo="%s" hidden>%s</div>'
            % (clase, ruta, titulo.replace('"', '&quot;'), cuerpo))

    plantilla = leer('tools/plantilla-paquete.html')
    salida = (plantilla
              .replace('/*CSS*/', css)
              .replace('/*IMG*/', repr(imgs).replace("'", '"'))
              .replace('<!--CABECERA-->', cabecera)
              .replace('<!--PAGINAS-->', '\n'.join(secciones))
              .replace('<!--PIE-->', pie)
              .replace('/*JS_COMUN*/', js_comun)
              .replace('/*JS_RESERVA*/', js_reserva))

    destino = os.path.join(RAIZ, sys.argv[1] if len(sys.argv) > 1 else 'hotel-almara.html')
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(salida)
    print('%s  ·  %d KB  ·  %d páginas  ·  %d ilustraciones'
          % (os.path.basename(destino), os.path.getsize(destino) // 1024, len(PAGINAS), len(imgs)))


if __name__ == '__main__':
    main()
