# BirdCut architecture

Core modules are CommonJS for Node tests and UXP `require()`, wrapped in an IIFE so the same files can load as classic `<script>` tags in `npm run preview`.


```
index.html / index.js          UXP entry (panels.birdcut.show)
src/ui/panel.js                Dark compact UI: Transcript, Trim, Captions, Settings
src/core/                      Transcript model, undo, cut planner, captions, caption style presets, trim drafts, settings
src/stt/                       Mock fixture + Adobe native JSON map + Whisper HTTP + bounce timing alignment
src/premiere/                  Sequence snapshot, Adobe STT, audio capture/bounce, apply cuts, import/insert captions
fixtures/sample-transcript.json
tests/                         node --test
```

## Transcript model

```json
{
  "version": 1,
  "source": { "kind": "mock|adobe|whisper|json", "label": "…" },
  "language": "en",
  "durationMs": 92000,
  "words": [
    { "id": "w1", "text": "Hello", "startMs": 0, "endMs": 400, "speakerId": "s1", "deleted": false, "isSilence": false, "isFiller": false }
  ],
  "speakers": [{ "id": "s1", "label": "Alex" }],
  "chapters": [{ "id": "c1", "title": "Hook", "startMs": 0, "endMs": 28000 }]
}
```

Deleted words are still stored (struck through in the UI) so undo and cut planning stay reversible. Silence markers are synthetic words with `isSilence: true`.

## Text → timeline

1. The user deletes words (or a trim draft marks them deleted).
2. `planCutsFromTranscript` merges contiguous deleted tokens into `removeRanges`.
3. `planTrackEdits` maps those ranges onto track items:
   - fully covered clip → `remove`
   - head/tail overlap → `setInPoint` / `setOutPoint` / `setStart`
   - hole in the middle → `cloneTrim` (UXP has no razor API)
4. `createRippleCutPlan` also builds a packed `targetClips` layout using a global time map so video and audio stay in sync.
5. **Apply cuts** executes those operations through `SequenceEditor` / track item actions inside `project.executeTransaction`. Captions are a separate **Add captions to sequence** path.

Cut-planning is the source of truth and is unit-tested. Premiere apply is best-effort; see `docs/premiere-api-limits.md`.

## STT

| Provider | Behavior |
| --- | --- |
| `mock` | Loads `fixtures/sample-transcript.json`. Ignores timeline media (offline demo). |
| `local-whisper` | Bounce sequence/clip with audio `.epr`, then `POST http://127.0.0.1:8090/v1/audio/transcriptions` (faster-whisper sidecar). **No API key.** `GET /health` — panel shows **Start the Local Whisper sidecar** if the process is down. Word times map like Whisper HTTP. |
| `adobe` | Premiere native Speech to Text: `Transcript.transcribeClipProjectItem` on each source `ClipProjectItem`, then `exportToJSON`. JSON follows Adobe’s published spec (`language` + `segments[].words[]` with seconds). Word times map onto the timeline via clip start / in / out. **No OpenAI key.** Cloud languages may still use Adobe credits; on-device packs do not. Optional on Premiere 26.5 Mac if native STT fails. |
| `whisper` | Captures **active sequence** (`exportSequence` + audio `.epr`) or **selected clip** (`getMediaFilePath()` when possible, else encode/bounce), then `POST {baseUrl}/audio/transcriptions` with word timestamps. Times are mapped onto sequence time (`src/stt/align-transcript.js`). |

API keys are read from Settings (UXP `secureStorage` when present, else plugin `localStorage`) or `BIRDCUT_STT_API_KEY` for Node. They are never hardcoded and are omitted from the public settings snapshot.

Non-secret settings persist to both `uxp.storage.localStorage` (preferred over `window.localStorage`, which Premiere UXP may drop) **and** `birdcut-settings.json` in the plugin data folder (`localFileSystem.getDataFolder()`). Changing the STT provider saves immediately so tab switches and **Choose .epr…** cannot snap the select back to Mock.

## Trim drafts

Each tool produces a **draft** (`wordIdsToDelete` and optional `clipWindows`) without immediately changing the timeline:

- Remove silence — gaps ≥ threshold
- Remove filler words — configurable list, including multi-word phrases
- Remove retakes — cue phrases + repeated 5-grams (heuristic)
- Create shortform clips — chapter windows, else densest speech windows

Save writes the draft into the transcript (and therefore the cut plan). Discard drops it. **Apply cuts** still requires the explicit **Apply cuts** button and at least one deleted range.

## Captions

**Add captions to sequence** is independent of the cut plan. It uses the current caption style preset (`captionPresetId` in settings), builds SRT + TTML from active (non-deleted) words, and asks the Premiere host to import/insert that file. Caption style cards live on the Captions tab.

## Out of scope (roadmap)

Multicam auto-switch, full After Effects caption motion (true bounce/pop keyframes, in-line karaoke highlight), script-matching AI, and billing are intentionally not in this MVP. Caption presets approximate those looks with static styled captions and word/phrase timing.
