# BirdCut

BirdCut is a Premiere Pro UXP panel for **text-based editing**: transcribe a sequence (or load a demo/JSON transcript), delete words, preview trim drafts, export captions, and apply a ripple cut plan to the timeline.

It is inspired by the *feature goals* of tools like Premiere Assistant-style transcript editors. It does **not** copy anyone else’s branding, name, or assets.

## Requirements

- Adobe Premiere Pro **25.6 or later** (Windows or macOS)
- [UXP Developer Tool](https://developer.adobe.com/premiere-pro/uxp/plugins/) **2.2+**
- Premiere **Developer Mode**: Settings → Plugins → Enable developer mode (restart Premiere)

Node 18+ is optional and only needed for `npm test` / the browser preview.

## Load in Premiere (Win / Mac)

1. Clone this repo.
2. Launch **Premiere Pro**, then **UXP Developer Tool**. Confirm UDT is connected to Premiere (Premiere appears in the left pane).
3. **Add Plugin** → select this folder (`birdcut-premiere`, the directory that contains `manifest.json`).
4. Click **Load** (or **Load & Watch** while developing).
5. In Premiere: **Window → UXP Plugins → BirdCut** (wording varies slightly by version; the panel id is `birdcut`).
6. Dock the panel next to the source monitor or timeline.

If you change `manifest.json`, **Unload** then **Load** again. Reload is enough for JS/CSS.

There is no extra build step. UXP loads the source files listed from `index.html` / `index.js`.

```bash
npm test          # cut planner, captions, trim drafts, STT mapper
npm run preview   # browser demo of the panel UI (Premiere APIs mocked)
```

## First run

1. Open a sequence (or just explore with the mock transcript).
2. **Settings**: language, STT provider, filler list, text size.
3. **Transcribe**
   - **Mock / demo transcript** — loads `fixtures/sample-transcript.json` (speakers, silences, fillers, a retake). Always available, including without media.
   - **OpenAI Whisper-compatible HTTP** — pick a WAV/MP3/M4A (or a BirdCut JSON transcript). Set base URL + model + API key in Settings. The key is stored locally; you can also set `BIRDCUT_STT_API_KEY` for Node tests. Never commit secrets.
4. On **Transcript**: search, click words (Shift for a range), **Delete**, **Undo** / **Redo**. Silence markers are italic; fillers are highlighted.
5. **Trim**: preview Remove silence / fillers / retakes / shortform clips. **Save draft** or **Discard**. Saving writes into the transcript and updates the cut plan.
6. **Captions**: review cues and **Export SRT**.
7. **Apply to sequence** executes the cut plan through Premiere UXP actions. **Save your project first.** Middle cuts are reconstructed without a razor API — read `docs/premiere-api-limits.md`.

## Transcript JSON

See `fixtures/sample-transcript.json` and `docs/architecture.md`. Shape:

```json
{
  "words": [{ "text": "Hello", "startMs": 0, "endMs": 400, "speakerId": "s1" }],
  "speakers": [{ "id": "s1", "label": "Alex" }],
  "chapters": [{ "id": "c1", "title": "Hook", "startMs": 0, "endMs": 28000 }]
}
```

## Project layout

| Path | Role |
| --- | --- |
| `manifest.json` | UXP plugin id `com.birdcut.premiere` |
| `src/core/cut-planner.js` | Deleted words → remove ranges → track edit ops |
| `src/stt/whisper-http.js` | Whisper-compatible client |
| `docs/architecture.md` | Module map |
| `docs/premiere-api-limits.md` | Honest UXP gaps |

## License

MIT. See `LICENSE`.
