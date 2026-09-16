# BirdCut architecture

BirdCut is an Adobe Premiere Pro **UXP panel** (manifest v5, Premiere 25.6+). Core editing logic is plain CommonJS so it can be unit-tested in Node without Premiere. The panel is a thin UI over that core, plus a Premiere host adapter.

```
index.html / index.js          UXP entry (panels.birdcut.show)
src/ui/panel.js                Dark compact UI: Transcript, Trim, Captions, Settings
src/core/                      Transcript model, undo, cut planner, captions, trim drafts, settings
src/stt/                       Mock fixture provider + Whisper-compatible HTTP client
src/premiere/                  Sequence snapshot + best-effort apply via premierepro
fixtures/sample-transcript.json
tests/                         node --test
```

## Transcript model

```json
{
  "version": 1,
  "source": { "kind": "mock|whisper|json", "label": "…" },
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
5. **Apply to sequence** executes those operations through `SequenceEditor` / track item actions inside `project.executeTransaction`.

Cut-planning is the source of truth and is unit-tested. Premiere apply is best-effort; see `docs/premiere-api-limits.md`.

## STT

| Provider | Behavior |
| --- | --- |
| `mock` | Loads `fixtures/sample-transcript.json` (also used when Premiere cannot bounce sequence audio). |
| `whisper` | `POST {baseUrl}/audio/transcriptions` with `response_format=verbose_json` and word timestamps. Compatible with OpenAI Whisper and local drop-in servers. |

API keys are read from Settings (UXP `secureStorage` when present, else plugin `localStorage`) or `BIRDCUT_STT_API_KEY` for Node. They are never hardcoded and are omitted from the public settings snapshot.

## Trim drafts

Each tool produces a **draft** (`wordIdsToDelete` and optional `clipWindows`) without immediately changing the timeline:

- Remove silence — gaps ≥ threshold
- Remove filler words — configurable list, including multi-word phrases
- Remove retakes — cue phrases + repeated 5-grams (heuristic)
- Create shortform clips — chapter windows, else densest speech windows

Save writes the draft into the transcript (and therefore the cut plan). Discard drops it. Apply still requires the explicit **Apply to sequence** button.

## Out of scope (roadmap)

Multicam auto-switch, animated caption presets, script-matching AI, and billing are intentionally not in this MVP.
