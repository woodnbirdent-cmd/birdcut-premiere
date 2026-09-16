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
| Source path | `ClipProjectItem.getMediaFilePath()` | Used when transcribing selected/sequence clips if a path exists. |
| Sequence bounce | `EncoderManager.exportSequence` | Exists, but needs a preset path and AME. Not assumed for MVP transcribe. |
| Captions track | `sequence.getCaptionTrack` | Can list tracks; there is no stable UXP “create SRT captions on timeline” helper, so BirdCut exports `.srt`. |
| Network | UXP `fetch` + manifest `requiredPermissions.network` | Whisper HTTP. `domains: all` so user-configured base URLs work; lock this down for Marketplace. |
| Files | `uxp.storage.localFileSystem` `request` | Pick audio / save SRT. |
| Secrets | `uxp.storage.secureStorage` when present | Fallback: plugin localStorage. Never commit keys. |

## Gaps that shape the MVP

1. **No razor / split-at-time API** in UXP (forum confirmation, still true as of Premiere 25.x/26.x docs). CEP QE could razor; UXP cannot. Middle deletes are reconstructed as **clone + in/out + start**, which is why apply is “save the project first” and why clone warnings appear in the apply result.
2. **No trim-by-arbitrary-range helper.** Adobe staff (2025) stated track-item trim-by-range was not exposed; in/out actions are the replacement.
3. **`createRemoveItemsAction` needs a TrackItemSelection.** Building a selection from arbitrary track items is not documented as a first-class factory. Fully covered clips are planned as `remove` operations; the executor asks you to select those clips or delete them after trims if a selection cannot be constructed.
4. **No sequence-audio bounce without AME/preset.** Transcribe of “active sequence” in demo mode uses the fixture. Whisper mode asks for an audio file (or JSON transcript). Next step: export a WAV via EncoderManager + a documented audio-only preset, then POST that file.
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
