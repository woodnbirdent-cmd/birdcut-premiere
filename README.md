# BirdCut

BirdCut is a Premiere Pro UXP panel for **text-based editing**: transcribe the active sequence or a selected clip, delete words, preview trim drafts, export captions, and apply a ripple cut plan to the timeline.

It is inspired by the *feature goals* of tools like Premiere Assistant-style transcript editors. It does **not** copy anyone else’s branding, name, or assets.

## Requirements

- Adobe Premiere Pro **25.6 or later** (tested target: **Premiere Pro 26 on Mac**)
- [UXP Developer Tool](https://developer.adobe.com/premiere-pro/uxp/plugins/) **2.2+**
- Premiere **Developer Mode**: Settings → Plugins → Enable developer mode (restart Premiere)
- For real transcription on Mac: **Local Whisper (on this Mac)** (faster-whisper sidecar, no API key) — recommended on Premiere **26.5**. Optionally **Adobe Premiere Speech to Text** (native; broken on some 26.5 installs with error **-1609629681**) or a Whisper-compatible HTTP endpoint and API key
- For Local Whisper / Whisper HTTP sequence bounce: an **audio-only Adobe Media Encoder preset** (`.epr`, MP3 preferred), e.g. `~/Documents/Adobe/Adobe Media Encoder/26.0/Presets/BirdCut Audio MP3.epr`. See `docs/premiere-api-limits.md`. Adobe native STT does **not** need a bounce preset.

Node 18+ is optional and only needed for `npm test` / the browser preview.

## Load in Premiere (Win / Mac)

1. Clone this repo (or pull the branch you want).
2. Launch **Premiere Pro**, then **UXP Developer Tool**. Confirm UDT is connected to Premiere.
3. **Add Plugin** → select this folder (the directory that contains `manifest.json`).
4. Click **Load** (or **Load & Watch** while developing).
5. In Premiere: **Window → UXP Plugins → BirdCut**.
6. Dock the panel next to the source monitor or timeline.

If you change `manifest.json` (this release does — filesystem permission is `fullAccess`), **Unload** then **Load** again. After any `git pull` on a machine that already loaded BirdCut, prefer **Unload → Load** so JS/CSS (scroll + settings persistence) actually replace the in-memory plugin. Reload-only can leave a stale panel.

There is no extra build step.

```bash
npm test                 # cut planner, captions, STT alignment, trim drafts
npm run preview          # browser demo of the panel UI (Premiere APIs mocked)
npm run sidecar:whisper  # start Local Whisper (faster-whisper) on :8090
```

## Transcribe with Local Whisper (recommended on Premiere 26.5 Mac)

Premiere UXP cannot run Whisper inside the panel. BirdCut bounces sequence/clip audio with your `.epr`, then `POST`s it to a sidecar on this Mac (`http://127.0.0.1:8090/v1`). **No API key.**

### One-time Apple Silicon setup

```bash
xcode-select --install          # if python3 is missing
brew install python@3.12 ffmpeg # ffmpeg decodes bounced MP3
cd sidecar/local-whisper
chmod +x start.sh
./start.sh                      # first run creates .venv and downloads the `base` model (~150 MB)
```

Leave that Terminal window open. Confirm:

```bash
curl -s http://127.0.0.1:8090/health
```

More detail: `sidecar/local-whisper/README.md`. Larger model: `BIRDCUT_WHISPER_MODEL=small ./start.sh`.

### In BirdCut

1. Open your sequence.
2. Settings → **STT provider** → **Local Whisper (on this Mac)** (saves immediately; top bar shows **Transcribe sequence** / **Clip** / **Pick file**).
3. Local Whisper URL stays `http://127.0.0.1:8090/v1`. Model default `base`.
4. **Choose .epr…** if needed — `BirdCut Audio MP3.epr` under `~/Documents/Adobe/Adobe Media Encoder/26.0/Presets/` works.
5. Click **Transcribe sequence**. Status: `exporting…` → `Sending audio to Local Whisper…` → `mapping words…`.

If the top bar says **Start Local Whisper sidecar**, the Python process is not running (start `./start.sh` again).

## Transcribe with Adobe Speech to Text (optional)

Adobe native STT is **optional**. On some **Premiere Pro 26.5 Mac** installs it keeps running then fails with **-1609629681** even after installing the English SpeechESL pack. Prefer **Local Whisper** on those machines.

If Adobe STT works on your build:

1. Open your sequence.
2. BirdCut **Settings** → **STT provider** → `Adobe Premiere Speech to Text / native` (saves immediately; top bar shows **Transcribe sequence** / **Clip** / **Import Premiere transcript**).
3. Language: pick a Premiere pack if the list appears. Install packs in Premiere **Window → Text**. If the pack for that language is missing, BirdCut **omits** the language option (Premiere default) instead of passing a guessed code that Premiere reports as error **-1609629681**. On-device packs stay local; **Adobe cloud languages may still use Adobe credits**.
4. **Preferred:** select a source **clip in the Project panel** (`ClipProjectItem`, not a nested sequence), then **Clip**.
5. **Transcribe sequence** runs native STT on each source clip used on the timeline and merges word timings onto sequence time.
6. If Premiere’s **Text** panel already transcribed the clip, click **Import Premiere transcript** — BirdCut only calls `exportToJSON` (no new Speech to Text).
7. Status bar shows elapsed time (`0:45 elapsed`) so a long run does not look stuck: `transcribing in Premiere…` → `exporting transcript…` → `mapping words…`.

Nested sequences cannot be transcribed. If `hasTranscript` is already true, BirdCut skips `transcribeClipProjectItem` and only exports.

## Troubleshooting: Adobe error -1609629681 (`0xa00f000f`)

Premiere often returns this **generic “unknown error”** instead of “unsupported language”, “pack missing”, or “wrong item selected”. BirdCut maps `-1609629681` / `1609629681` / `0xa00f000f` to:

> Premiere Speech to Text failed (error -1609629681). Install an on-device language pack in Window → Text, select the source clip in the Project panel, or transcribe once in Premiere’s Text panel and run BirdCut Clip to import.

What to do:

1. Premiere **Window → Text** — install the **on-device** language pack for the spoken language (or transcribe once there so Adobe credits/packs are confirmed).
2. In the **Project** panel, select the actual source clip — not a nested sequence, not only a timeline track item if the Project panel clip is available.
3. If Text-panel STT already finished, BirdCut **Import Premiere transcript** (or **Clip**, which reuses `hasTranscript`).
4. If Speech to Text returns `false`, that usually means packs or Adobe cloud credits — not a BirdCut hang.

BirdCut no longer waits ten minutes swallowing that error: it fails fast with the message above. If packs are installed and it still fails on 26.5, switch to **Local Whisper**.

## Transcribe with Whisper (optional)

Mock mode always loads `fixtures/sample-transcript.json` and **ignores** timeline media. That is intentional for offline UI demos.

To transcribe **your** sequence or clip with Whisper:

1. Open the sequence that contains the demo clip.
2. BirdCut **Settings**:
   - **STT provider** → `OpenAI Whisper-compatible HTTP` (saves immediately)
   - **Whisper base URL** → `https://api.openai.com/v1` (or your local server)
   - **API key** → paste the key → **Save settings** (stored in UXP secure storage / plugin data; never committed)
   - Optional: **Choose .epr…** and pick an MP3 or WAV audio-only preset (needed when BirdCut must bounce mixed timeline audio, or when the source file is larger than ~25 MB). This does not reset the provider.
3. Click **Transcribe sequence** to bounce the **active sequence** mix, upload it, and load word timings aligned to sequence time.
4. Or select the demo clip on the timeline and click **Clip**. BirdCut prefers `getMediaFilePath()` when that file is already on disk and small enough for Whisper; otherwise it bounces that clip/range.
5. Watch the status bar: `exporting…` → `uploading…` → `mapping words…`.

**Pick file** remains a Whisper fallback if bounce is unavailable.

## After pulling this branch (UXP Developer Tool)

1. `git pull` (or check out the PR branch).
2. In UDT, select BirdCut → **Unload** → **Load**. Do this even for JS/CSS-only pulls so Premiere 26 does not keep the previous panel.
3. Open **Window → UXP Plugins → BirdCut**.
4. In Terminal (leave it running): `cd sidecar/local-whisper && ./start.sh`
5. Settings → **Local Whisper (on this Mac)** (sticks immediately; no OpenAI key).
6. Confirm `.epr` (e.g. `BirdCut Audio MP3.epr`) → **Transcribe sequence**.
7. If the top bar says **Start Local Whisper sidecar**, the Python server is not up. Confirm `curl -s http://127.0.0.1:8090/health`. If a pane still does not scroll, Unload → Load once more.

## First run (editing)

1. On **Transcript**: search, click words (Shift for a range), **Delete**, **Undo** / **Redo**.
2. **Trim**: preview silence / fillers / retakes / shortform. **Save draft** or **Discard**.
3. **Captions**: **Export SRT**.
4. **Apply to sequence** — save the project first. See `docs/premiere-api-limits.md`.

## Transcript JSON

See `fixtures/sample-transcript.json` and `docs/architecture.md`.

## License

MIT. See `LICENSE`.
