#!/usr/bin/env python3
"""
Genera la locución en español del vídeo y la incrusta en el MP4.

    python3 tools/video/locucion.py hotel-almara-reel.mp4

La voz se sintetiza con el servicio de texto a voz de Google Translate: es
una voz sintética, suficiente para una demo, pero si quieres algo más cálido
graba las mismas frases con tu propia voz y sustituye los WAV de trabajo.

Para cambiar el texto, edita LINEAS: cada entrada es (inicio, tope, frase),
donde "tope" es el segundo en el que empieza la escena siguiente. El script
avisa si alguna frase no cabe en su hueco.
"""
import os, re, subprocess, sys, tempfile, urllib.parse, urllib.request

import imageio_ffmpeg

FFMPEG = os.environ.get('FFMPEG') or imageio_ffmpeg.get_ffmpeg_exe()
DURACION = 18.0

# (inicio en segundos, tope de la escena, frase)
LINEAS = [
    (0.8,  4.4,  'Esto no es una plantilla. Es una web a medida.'),
    (4.6,  7.4,  'Diseño e ilustraciones propias.'),
    (7.6,  11.4, 'Reserva directa en tres pasos, sin comisiones.'),
    (11.6, 14.8, 'Y un agente de WhatsApp siempre activo.'),
    (15.0, 17.9, '¿La quieres para tu negocio? Escríbeme.'),
]

CABECERAS = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                           '(KHTML, like Gecko) Chrome/120 Safari/537.36'}
# Recorta el silencio de los extremos y acelera un punto la dicción.
FILTRO = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,'
          'areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,'
          'areverse,atempo=1.10,volume=1.6')


def duracion(ruta):
    salida = subprocess.run([FFMPEG, '-hide_banner', '-i', ruta],
                            capture_output=True, text=True).stderr
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', salida)
    return int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0


def sintetizar(texto, destino):
    url = ('https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q='
           + urllib.parse.quote(texto))
    datos = urllib.request.urlopen(urllib.request.Request(url, headers=CABECERAS), timeout=60).read()
    crudo = destino + '.mp3'
    with open(crudo, 'wb') as f:
        f.write(datos)
    subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-i', crudo,
                    '-af', FILTRO, '-ar', '44100', '-ac', '2', destino], check=True)
    return duracion(destino)


def main():
    if len(sys.argv) < 2:
        sys.exit('uso: locucion.py <video.mp4> [salida.mp4]')
    video = sys.argv[1]
    salida = sys.argv[2] if len(sys.argv) > 2 else video.replace('.mp4', '-voz.mp4')

    with tempfile.TemporaryDirectory() as tmp:
        pistas, problemas = [], []
        for i, (inicio, tope, texto) in enumerate(LINEAS):
            ruta = os.path.join(tmp, 'l%d.wav' % i)
            d = sintetizar(texto, ruta)
            hueco = tope - inicio
            estado = 'ok' if d <= hueco else 'SE PASA %.2f s' % (d - hueco)
            if d > hueco:
                problemas.append(texto)
            print('  %5.1fs  %4.2fs de %4.2fs  %-46s %s' % (inicio, d, hueco, texto[:44], estado))
            pistas.append((ruta, inicio))

        if problemas:
            print('\nAcorta estas frases o retrasa la escena siguiente:')
            for p in problemas:
                print('  -', p)
            sys.exit(1)

        entradas, filtros, etiquetas = [], [], []
        for i, (ruta, inicio) in enumerate(pistas):
            entradas += ['-i', ruta]
            ms = int(inicio * 1000)
            filtros.append('[%d:a]adelay=%d|%d[a%d]' % (i, ms, ms, i))
            etiquetas.append('[a%d]' % i)
        filtros.append('%samix=inputs=%d:normalize=0:dropout_transition=0[m]'
                       % (''.join(etiquetas), len(pistas)))
        filtros.append('[m]apad,atrim=0:%s,loudnorm=I=-16:TP=-1.5:LRA=11,'
                       'afade=t=out:st=%s:d=0.6[out]' % (DURACION, DURACION - 0.6))

        mezcla = os.path.join(tmp, 'locucion.wav')
        subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error'] + entradas
                       + ['-filter_complex', ';'.join(filtros), '-map', '[out]',
                          '-c:a', 'pcm_s16le', mezcla], check=True)

        subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error',
                        '-i', video, '-i', mezcla,
                        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
                        '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
                        '-shortest', '-movflags', '+faststart', salida], check=True)
    print('\nListo:', salida)


if __name__ == '__main__':
    main()
