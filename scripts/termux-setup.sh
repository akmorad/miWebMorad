#!/data/data/com.termux/files/usr/bin/bash
# Instalación en Termux (Android). Ejecutar: bash scripts/termux-setup.sh
set -euo pipefail

echo "==> Actualizando paquetes de Termux"
pkg update -y && pkg upgrade -y

echo "==> Instalando Node.js y git"
pkg install -y nodejs-lts git

node_major=$(node -p "process.versions.node.split('.')[0]")
if [ "$node_major" -lt 20 ]; then
  echo "Se necesita Node 20 o superior; Termux instaló $(node -v)." >&2
  exit 1
fi

echo "==> Instalando dependencias"
npm install --omit=dev

cat <<'MSG'

Listo. Siguiente paso:

    npm run setup

Sobre Termux en concreto:
  - Android mata procesos en segundo plano. Ejecuta `termux-wake-lock` antes de
    un mint largo, o el sistema dormirá el bot justo cuando abra la venta.
  - Los datos móviles añaden latencia muy variable. Para un mint disputado, un
    VPS cerca del secuenciador gana a cualquier teléfono.
  - El keystore queda en el almacenamiento de la app. Si desinstalas Termux, se
    borra: guarda la frase semilla aparte.
MSG
