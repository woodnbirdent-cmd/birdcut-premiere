# BirdCut Local Whisper sidecar

Premiere UXP cannot run Whisper inside the panel. This small **faster-whisper** server on your Mac exposes an OpenAI-compatible API:

- `GET /health`
- `POST /v1/audio/transcriptions` with `verbose_json` + word timestamps

BirdCut **Local Whisper (on this Mac)** bounces the sequence with your `.epr`, then `POST`s the audio here. **No API key.**

## Apple Silicon Mac (one-time)

```bash
# Command Line Tools if python/pip are missing
xcode-select --install

# ffmpeg is required to decode bounced MP3/WAV
brew install python@3.12 ffmpeg

cd sidecar/local-whisper
chmod +x start.sh
./start.sh
```

First start downloads the Whisper **base** model (~150 MB) into the Hugging Face cache. Leave the Terminal window open.

Health check:

```bash
curl -s http://127.0.0.1:8090/health
```

Larger / more accurate: `BIRDCUT_WHISPER_MODEL=small ./start.sh` (or `medium`, `large-v3`, `base.en`).

## Then in Premiere

1. UXP Developer Tool → BirdCut → **Unload → Load**
2. Settings → **Local Whisper (on this Mac)**
3. Confirm Local Whisper URL `http://127.0.0.1:8090/v1`
4. Audio-only `.epr` — e.g. `~/Documents/Adobe/Adobe Media Encoder/26.0/Presets/BirdCut Audio MP3.epr`
5. **Transcribe sequence**

If the panel says **Start Local Whisper sidecar**, this process is not running (or is on another port).
