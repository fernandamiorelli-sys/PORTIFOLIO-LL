#!/usr/bin/env bash
# Instala a Earshot (github.com/Leonxlnx/earshot, MIT) no modo leve e imprime o caminho do executável.
#
# Modo leve: o banco de 252 sons feitos em código (`earshot sfx`), os kits (`earshot kit`) e as medições
# (`earshot measure`), sem PyTorch e sem modelos. A escuta com IA (`describe`, `match`, `find`, `critique`)
# precisa do PyTorch e de 1,1 GB de modelos do Hugging Face, que esta nuvem bloqueia.
#
#   bash scripts/setup-earshot.sh                    # instala (uma vez por sessão, ~40 s) e imprime o executável
#   EARSHOT_OFFLINE=1 "$(bash scripts/setup-earshot.sh)" sfx list
set -euo pipefail

EARSHOT_REF="591fa3e028032e6dce56620a20e932e35667e8d8" # v0.4.0
VENV="${EARSHOT_VENV:-$HOME/.cache/earshot-venv}"

if [ ! -x "$VENV/bin/earshot" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/python" -m pip install -q --disable-pip-version-check \
    numpy scipy soundfile soxr librosa pyloudnorm scikit-learn pillow matplotlib >&2
  "$VENV/bin/python" -m pip install -q --disable-pip-version-check --no-deps \
    "earshot @ git+https://github.com/Leonxlnx/earshot@${EARSHOT_REF}" >&2
fi

echo "$VENV/bin/earshot"
