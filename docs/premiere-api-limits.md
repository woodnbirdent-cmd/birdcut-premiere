# Premiere UXP API limits (BirdCut)

BirdCut targets **Premiere Pro 25.6+** and **UXP Developer Tool 2.2+**. It is a UXP panel, not a CEP extension. CEP is only mentioned here where UXP still cannot match older QE/ExtendScript capabilities.

Sources: [Premiere UXP API](https://developer.adobe.com/premiere-pro/uxp/), [SequenceEditor](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/sequenceeditor/), [VideoClipTrackItem](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/videocliptrackitem), Adobe Creative Cloud Developer Forums (2024–2026).

## What we use

| Task | API | Notes |
| --- | --- | --- |
| Active project / sequence | `Project.getActiveProject()`, `project.getActiveSequence()` | Async; no ExtendScript-style blocking. |
| Track inventory | `sequence.getVideoTrackCount/getAudioTrackCount`, `getVideoTrack`, `getAudioTrack`, `track.getTrackItems` | Defensive: clip type enums vary by Premiere build. |
| Playhead | `sequence.setPlayerPosition(TickTime)` | Word click in the panel seeks when the host allows it. |
| Trim in/out | `trackItem.createSetInPointAction` / `createSetOutPointAction` | Media-relative. Since 25.6. |
| Move clip | `trackItem.createSetStartAction` | Sequence-relative pack after cuts. |
| Duplicate clip | `SequenceEditor.createCloneTrackItemAction` | Offset-based. Used to reconstruct a clip after a middle hole. `isInsert=true` has reported audio-collapse bugs; BirdCut uses overwrite (`false`). |
| Ripple remove | `SequenceEditor.createRemoveItemsAction(selection, ripple, mediaType)` | Requires a `TrackItemSelection`. |
| Source path | `ClipProjectItem.getMediaFilePath()` | First choice for Whisper **Transcribe clip** when the media is a file on disk. |
| Native STT | `Transcript.transcribeClipProjectItem`, `exportToJSON`, `hasTranscript`, `querySupportedLanguages` | Adobe Speech to Text is **per source clip**, not per sequence mix. JSON spec: [transcript_format_spec.json](https://github.com/AdobeDocs/uxp-premiere-pro-samples/blob/main/sample-panels/premiere-api/assets/transcript_format_spec.json). Nested sequences cannot be transcribed directly. |
| Sequence bounce | `EncoderManager.exportSequence(sequence, ExportType.IMMEDIATELY, output, preset.epr, exportFull)` | Verified against Premiere UXP 25.6+/26 docs. Needs an audio-only `.epr`. Writes to the plugin temp folder. |
| Clip bounce | `encodeFile` / `encodeProjectItem` | Used when the source file is missing, too large for Whisper (~25 MB), or not a sendable format. AME is typical. |
| Encoder events | `EventManager.addEventListener(manager, EncoderManager.EVENT_RENDER_COMPLETE)` | Wait for bounce if IMMEDIATELY is not fully blocking. |
| Captions track | `sequence.getCaptionTrack` | Can list tracks; there is no stable UXP “create SRT captions on timeline” helper, so BirdCut exports `.srt`. |
| Network | UXP `fetch` + manifest `requiredPermissions.network` | Whisper HTTP. `domains: "all"` remains because Settings allows a **user-configured** base URL. Marketplace builds should lock this to known hosts. |
| Files | `uxp.storage.localFileSystem` **`fullAccess`** | Required to read `getMediaFilePath()` media and write bounced WAV/MP3 under the plugin temp folder. |
| Secrets | `uxp.storage.secureStorage` when present | Fallback: plugin localStorage. Never commit keys. |
| Settings | `uxp.storage.localStorage` + plugin data folder file | `window.localStorage` is unreliable in some Premiere UXP hosts. Provider changes auto-save. |
| Panel scroll | CSS `overflow-y: scroll` + `min-height: 0` on `.pane` | Premiere often ignores `overflow: auto` on flex children. Unload→Load after CSS pulls. |

## Transcribe / bounce (Premiere 26)

**Hypothesis confirmed:** UXP does **not** expose a dedicated “audio-only bounce” flag. Audio extraction is `exportSequence` / `encodeFile` **plus an audio-only Media Encoder preset** (`.epr`). There is [no UXP API to list AME presets](https://forums.creativeclouddeveloper.com/t/how-to-get-the-media-encoder-formats-and-preset-list-from-premiere-pro-uxp-api/11118).

### Preset the user must install

1. Open **Adobe Media Encoder** (or Premiere Export Settings).
2. Format: **MP3** (preferred, stays under Whisper’s ~25 MB cap) or **WAV**.
3. Save a preset, e.g. `BirdCut Audio MP3.epr`.
4. In BirdCut **Settings** click **Choose .epr…** and select that file.

BirdCut also searches common Premiere/AME **26/25** `MediaIO/systempresets` folders on Mac and Windows (names containing `mp3`, `mpeg audio`, `wave`, `wav`). If none are readable from UXP, set the path manually.

Typical Mac locations:

- `/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents/MediaIO/systempresets/`
- `/Volumes/WNB Apps/Applications/Adobe Premiere Pro 2026/.../MediaIO/systempresets/` (external-apps volume)
- `~/Documents/Adobe/Adobe Media Encoder/26.0/Presets/`

### Alignment

- Sequence bounce: Whisper `start`/`end` seconds are treated as sequence time (plus any export offset).
- Selected file: media-relative times map with `sequenceTime = clipStart + (wordTime - clipInPoint)`.

### Gaps

- No razor / split-at-time API (middle cuts still clone + in/out).
- `createRemoveItemsAction` still needs a `TrackItemSelection`.
- IMMEDIATELY vs AME queue behavior varies by machine; BirdCut waits on the output file and encoder events.
- Linked A/V clone insert can collapse adjacent audio when `isInsert=true`; apply still uses overwrite.
- Panel `hide` / `destroy` remain unreliable; `show()` is the mount point.

## Gaps that shape the MVP

1. **No razor / split-at-time API** in UXP (forum confirmation, still true as of Premiere 25.x/26.x docs). CEP QE could razor; UXP cannot. Middle deletes are reconstructed as **clone + in/out + start**, which is why apply is “save the project first” and why clone warnings appear in the apply result.
2. **No trim-by-arbitrary-range helper.** Adobe staff (2025) stated track-item trim-by-range was not exposed; in/out actions are the replacement.
3. **`createRemoveItemsAction` needs a TrackItemSelection.** Building a selection from arbitrary track items is not documented as a first-class factory. Fully covered clips are planned as `remove` operations; the executor asks you to select those clips or delete them after trims if a selection cannot be constructed.
4. **Sequence bounce needs an `.epr`.** Transcribe sequence uses `EncoderManager.exportSequence` + an audio-only preset. Transcribe clip prefers `getMediaFilePath()` then `encodeFile`. See **Transcribe / bounce** above.
5. **Panel `hide` / `destroy` are unreliable** in Premiere (tied to create/destroy, 300ms timeout). BirdCut treats `show()` as the real mount point and is idempotent.
6. **Word-level captions on a caption track** are not a complete UXP workflow. SRT export is the supported MVP path; importing that SRT in Premiere remains a manual or later-API step.
7. **Linked A/V clone insert** can collapse adjacent audio when `isInsert=true`. Documented as a host bug; we avoid insert mode.
8. **UXP HTML/CSS is not a browser.** No npm runtime inside the panel. Keep the plugin as source CommonJS; tests run in Node.

## CEP vs UXP

Do not add a CEP fallback unless a specific gap becomes a blocker (razor is the main one). A dual CEP+UXP tree would fork apply logic. Prefer staying on UXP and narrowing apply to in/out + clone + documented remove-selection until Adobe ships razor/trim-range APIs.

## Hardening checklist (timeline apply)

- Save the project before Apply.
- Prefer deleting whole extra takes as their own clips (remove + ripple) instead of many middle holes.
- After Apply, inspect A1/V1 alignment; undo in Premiere if a clone landed on overwrite.
- Re-read track items after each transaction instead of reusing native handles across multiple applies.
- When Adobe ships razor or `createSplitAction`, replace `cloneTrim` with split + ripple-delete of the middle piece.
