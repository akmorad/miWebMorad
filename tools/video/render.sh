#!/bin/bash
# ==========================================================================
# Genera el vídeo vertical (1080x1920) de la demo para Instagram.
#
#   ./tools/video/render.sh [segundos] [fps]
#
# Cada fotograma se renderiza por separado con Chrome a partir de
# fotograma.html?f=N, que calcula la composición solo con el número de
# fotograma. Por eso el resultado es idéntico en cada ejecución y los
# fotogramas se pueden renderizar en paralelo.
#
# Requisitos: Chrome/Chromium, ffmpeg con libx264 y un servidor estático
# sirviendo la raíz del proyecto en el puerto 8899.
# ==========================================================================
set -euo pipefail

SEGUNDOS="${1:-18}"
FPS="${2:-30}"
TOTAL=$(( SEGUNDOS * FPS ))
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
TRABAJO="${TMPDIR:-/tmp}/almara-video"
CHROME="${CHROME:-$(command -v chromium || command -v google-chrome || echo /opt/pw-browsers/chromium-1194/chrome-linux/chrome)}"
FFMPEG="${FFMPEG:-$(command -v ffmpeg)}"
PARALELO="${PARALELO:-8}"

mkdir -p "$TRABAJO/fotogramas"

# Servidor estático temporal
python3 -m http.server 8899 --bind 127.0.0.1 --directory "$RAIZ" >/dev/null 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null || true' EXIT
sleep 1

uno() {
  local n=$1
  local salida
  salida=$(printf "%s/fotogramas/%05d.png" "$TRABAJO" "$n")
  [ -s "$salida" ] && return 0
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --disable-background-networking --user-data-dir="/tmp/almara-cr-$((n % 12))" \
    --run-all-compositor-stages-before-draw --virtual-time-budget=3500 \
    --force-device-scale-factor=1 --screenshot="$salida" --window-size=1080,1920 \
    "http://127.0.0.1:8899/tools/video/fotograma.html?f=$n" >/dev/null 2>&1
}
export -f uno
export TRABAJO CHROME

echo "Renderizando $TOTAL fotogramas ($SEGUNDOS s a $FPS fps)…"
seq 0 $(( TOTAL - 1 )) | xargs -P "$PARALELO" -I{} bash -c 'uno {}'

echo "Codificando…"
"$FFMPEG" -y -hide_banner -loglevel error \
  -framerate "$FPS" -i "$TRABAJO/fotogramas/%05d.png" \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -c:v libx264 -preset slow -crf 18 -profile:v high -level 4.0 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -shortest -movflags +faststart \
  -r "$FPS" "$RAIZ/hotel-almara-reel.mp4"

echo "Listo: $RAIZ/hotel-almara-reel.mp4"
