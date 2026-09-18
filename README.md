# BirdCut

BirdCut is a Premiere Pro UXP panel for **text-based editing**: transcribe the active sequence or a selected clip, delete words, preview trim drafts, **add captions to the sequence**, and apply a ripple cut plan to the timeline.

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

If the top bar says **Start the Local Whisper sidecar**, the Python process is not running (start `./start.sh` again).

## Transcribe with Adobe Speech to Text (optional)

Adobe native STT is **optional**. On some **Premiere Pro 26.5 Mac** installs it keeps running then fails with **-1609629681** even after installing the English SpeechESL pack. Prefer **Local Whisper** on those machines.

If Adobe STT works on your build:

1. Open your sequence.
2. BirdCut **Settings** → **STT provider** → `Adobe Premiere Speech to Text / native` (saves immediately; top bar shows **Transcribe sequence** / **Clip**).
3. Language: pick a Premiere pack if the list appears. Install packs in Premiere **Window → Text**. On-device packs stay local; **Adobe cloud languages may still use Adobe credits**.
4. Click **Transcribe sequence** to run native STT on each source `ClipProjectItem` used on the timeline and merge word timings onto sequence time.
5. Or select a clip and click **Clip** (`Transcript.transcribeClipProjectItem` → `exportToJSON`).
6. Status bar: `transcribing in Premiere…` → `exporting transcript…` → `mapping words…`.

Nested sequences cannot be transcribed directly. If a clip already has a Premiere transcript, BirdCut reuses it.

Whisper HTTP remains available if you want an OpenAI-compatible cloud endpoint instead.

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
7. After words load, open **Captions**: pick a **Style preset**, set **Animation feel** / **1 word** / **2 words**, optionally **ALL CAPS**, font, and color **swatches** (or hex), then **Add captions to sequence**.
8. If the top bar says **Start the Local Whisper sidecar**, the Python server is not up. Confirm `curl -s http://127.0.0.1:8090/health`. If a pane still does not scroll, Unload → Load once more.

## First run (editing)

1. On **Transcript**: search, click words (Shift for a range), **Delete**, **Undo** / **Redo**.
2. **Trim**: preview silence / fillers / retakes / shortform. **Save draft** or **Discard**.
3. **Captions**: pick a **Style preset**, set **Animation feel**, **1 word / 2 words / Phrase**, **ALL CAPS**, font, and color swatches, then **Add captions to sequence**. That action does **not** need deleted words. **Export SRT** remains available.
4. **Apply cuts** — only for ranges you marked for deletion. Save the project first. See `docs/premiere-api-limits.md`.

## Add captions + styles

After a successful transcribe, the primary next step is **Add captions to sequence** (top bar and Captions tab). You do **not** need to delete words first. **Apply cuts** is a separate action and will say so if nothing is marked for removal.

### Captions tab (owns the look)

Style, **animation feel**, **words on screen**, **ALL CAPS**, font, and colors live on **Captions**, not Settings. Settings only keeps speaker names for phrase captions.

- **Style presets** (labeled, above the cue list): Clean Lower Third, Bold Center, Karaoke, Pop, Subtitle box, Social vertical-safe. Cards tagged **Look** vs **Timing + look**.
- **Animation feel**: **None** (phrase), **Karaoke** (1 word), **Pop** (2 words). Tied to words-on-screen defaults; you can still override 1 / 2 / Phrase.
- **Words on screen**: **1 word**, **2 words**, or **Phrase**. Timing comes from Whisper/Adobe **word timestamps**.
- **ALL CAPS**: forces uppercase letters in the preview, SRT, TTML, and the sequence import. This is the one “style” Premiere cannot strip, because it is the cue text.
- **Font + color**: system-safe `<select>` for font. Premiere UXP’s `input type="color"` is unreliable, so BirdCut uses **swatch buttons + hex fields**. Live preview updates in the panel. Choices persist with the preset as overrides.

### Animation limits (honest)

Premiere UXP still has **no** caption-track keyframes, **no** MOGRT source-text API, and **no** `createCaptionTrack()`. BirdCut cannot play a true After Effects pop/bounce on the timeline.

What we *can* do:

- Short **1–2 word** cues with snappy in/out from word times (the “words pop on” feel)
- Styled **TTML** (font, color, outline, region) imported as `.ttml`, plus SRT with `<font face>` / color tags
- A **panel-only** scale pop in the Captions preview so you can judge the look
- **ALL CAPS** as real uppercase letters in the file

Karaoke is sequential word cues, not a highlight inside a full line.

### What Premiere actually receives

BirdCut writes a styled `.ttml` (preferred) and a `.srt` to the plugin temp folder, `project.importFiles`s the TTML first, then tries `SequenceEditor.createInsertProjectItemAction`. If insert does not create a caption track, drag the **`.ttml`** (not only the SRT) from the Project panel onto the sequence.

**Font/color on the timeline are not guaranteed.** Premiere’s SRT importer usually ignores font/color and uses its default caption look. TTML carries the styles; some Premiere builds still strip them after import. The status line says so. **ALL CAPS** and **1–2 word timing** are in the cue text/times, so those still show.

Reload after this change: UXP Developer Tool → BirdCut → **Unload** → **Load**, then Window → UXP Plugins → BirdCut. Do not keep an older copy of the folder loaded from Downloads if you also pulled `main`.

## Transcript JSON

See `fixtures/sample-transcript.json` and `docs/architecture.md`.

## License

MIT. See `LICENSE`.
