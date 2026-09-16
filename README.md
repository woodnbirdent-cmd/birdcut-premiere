# BirdCut

BirdCut is a Premiere Pro UXP panel for **text-based editing**: transcribe the active sequence or a selected clip, delete words, preview trim drafts, export captions, and apply a ripple cut plan to the timeline.

It is inspired by the *feature goals* of tools like Premiere Assistant-style transcript editors. It does **not** copy anyone else’s branding, name, or assets.

## Requirements

- Adobe Premiere Pro **25.6 or later** (tested target: **Premiere Pro 26 on Mac**)
- [UXP Developer Tool](https://developer.adobe.com/premiere-pro/uxp/plugins/) **2.2+**
- Premiere **Developer Mode**: Settings → Plugins → Enable developer mode (restart Premiere)
- For real transcription: a Whisper-compatible HTTP endpoint and API key (OpenAI or local drop-in)
- For sequence bounce: an **audio-only Adobe Media Encoder preset** (`.epr`, MP3 preferred). See `docs/premiere-api-limits.md`.

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
npm test          # cut planner, captions, STT alignment, trim drafts
npm run preview   # browser demo of the panel UI (Premiere APIs mocked)
```

## Transcribe a demo clip (Premiere 26 / Mac)

Mock mode always loads `fixtures/sample-transcript.json` and **ignores** timeline media. That is intentional for offline UI demos.

To transcribe **your** sequence or clip:

1. Open the sequence that contains the demo clip.
2. BirdCut **Settings**:
   - **STT provider** → `OpenAI Whisper-compatible HTTP` (saves immediately; the top bar switches to **Transcribe sequence** / **Clip** without a separate Save)
   - **Whisper base URL** → `https://api.openai.com/v1` (or your local server)
   - **API key** → paste the key → **Save settings** (stored in UXP secure storage / plugin data; never committed)
   - Optional: **Choose .epr…** and pick an MP3 or WAV audio-only preset (needed when BirdCut must bounce mixed timeline audio, or when the source file is larger than ~25 MB). This does not reset the provider.
3. Click **Transcribe sequence** to bounce the **active sequence** mix, upload it, and load word timings aligned to sequence time.
4. Or select the demo clip on the timeline and click **Clip**. BirdCut prefers `getMediaFilePath()` when that file is already on disk and small enough for Whisper; otherwise it bounces that clip/range.
5. Watch the status bar: `exporting…` → `uploading…` → `mapping words…`. Errors name the fix (no key, missing preset, network blocked, empty audio).

**Pick file** remains a fallback if bounce is unavailable.

## After pulling this branch (UXP Developer Tool)

1. `git pull` (or check out the PR branch).
2. In UDT, select BirdCut → **Unload** → **Load**. Do this even for JS/CSS-only pulls so Premiere 26 does not keep the previous panel.
3. Open **Window → UXP Plugins → BirdCut**.
4. Settings → Whisper (sticks immediately). Paste an API key → **Save settings**.
5. Open your sequence → **Transcribe sequence**, or select the clip → **Clip**.
6. Confirm the Transcript and Settings panes scroll with the trackpad. If a pane still does not scroll, Unload → Load once more after this pull.

## First run (editing)

1. On **Transcript**: search, click words (Shift for a range), **Delete**, **Undo** / **Redo**.
2. **Trim**: preview silence / fillers / retakes / shortform. **Save draft** or **Discard**.
3. **Captions**: **Export SRT**.
4. **Apply to sequence** — save the project first. See `docs/premiere-api-limits.md`.

## Transcript JSON

See `fixtures/sample-transcript.json` and `docs/architecture.md`.

## License

MIT. See `LICENSE`.
