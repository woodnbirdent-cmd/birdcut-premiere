#!/usr/bin/env bash
# One-command start for the BirdCut Local Whisper sidecar (Apple Silicon / Intel Mac).
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required. On Apple Silicon: brew install python@3.12 ffmpeg" >&2
  exit 1
fi

if [ ! -d .venv ]; then
  echo "Creating .venv and installing faster-whisper (first run downloads the model on start)…"
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi

export BIRDCUT_WHISPER_HOST="${BIRDCUT_WHISPER_HOST:-127.0.0.1}"
export BIRDCUT_WHISPER_PORT="${BIRDCUT_WHISPER_PORT:-8090}"
export BIRDCUT_WHISPER_MODEL="${BIRDCUT_WHISPER_MODEL:-base}"
echo "Starting Local Whisper on http://${BIRDCUT_WHISPER_HOST}:${BIRDCUT_WHISPER_PORT} (model=${BIRDCUT_WHISPER_MODEL})"
exec .venv/bin/python server.py
