"use strict";
(function (root) {
function loadPresets() {
  if (typeof require === "function") {
    try {
      return require("./presets");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutPresets || {};
}

const presets = loadPresets();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileUrl(nativePath) {
  const normalized = String(nativePath || "").replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(normalized)) return `file:///${normalized}`;
  if (normalized.startsWith("/")) return `file://${normalized}`;
  return `file:${normalized}`;
}

function byteLengthOf(bytes) {
  if (!bytes) return 0;
  if (typeof bytes.byteLength === "number") return bytes.byteLength;
  if (typeof bytes.length === "number") return bytes.length;
  return 0;
}

function progress(onProgress, stage, message) {
  if (typeof onProgress === "function") onProgress({ stage, message });
}

async function getEncoderManager(ppro) {
  const EM = ppro && ppro.EncoderManager;
  if (!EM) {
    throw new Error("EncoderManager is not available in this Premiere build.");
  }
  if (typeof EM.getManager === "function") {
    const manager = EM.getManager();
    return manager && typeof manager.then === "function" ? await manager : manager;
  }
  return EM.getManager;
}

function exportTypeImmediately(ppro, manager) {
  if (ppro.Constants && ppro.Constants.ExportType && ppro.Constants.ExportType.IMMEDIATELY) {
    return ppro.Constants.ExportType.IMMEDIATELY;
  }
  if (ppro.EncoderManager && ppro.EncoderManager.EXPORT_IMMEDIATELY) {
    return ppro.EncoderManager.EXPORT_IMMEDIATELY;
  }
  if (manager && manager.EXPORT_IMMEDIATELY) return manager.EXPORT_IMMEDIATELY;
  return "IMMEDIATELY";
}

async function entryFromPath(fs, nativePath) {
  if (!fs) return null;
  const url = fileUrl(nativePath);
  try {
    if (typeof fs.getEntryWithUrl === "function") {
      return await fs.getEntryWithUrl(url);
    }
  } catch (_err) {
    /* try plugin-temp / createEntry */
  }
  try {
    if (typeof fs.createEntryWithUrl === "function") {
      return await fs.createEntryWithUrl(url, { overwrite: false });
    }
  } catch (_err) {
    return null;
  }
  return null;
}

async function readEntryBytes(uxp, entry) {
  if (!entry || typeof entry.read !== "function") return null;
  const format = uxp && uxp.storage && uxp.storage.formats ? uxp.storage.formats.binary : undefined;
  return format ? entry.read({ format }) : entry.read();
}

async function walkPresetFolder(folder, depth, hits) {
  if (!folder || depth > 5) return;
  let entries = [];
  try {
    entries = (await folder.getEntries()) || [];
  } catch (_err) {
    return;
  }
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const name = entry.name || "";
    if (entry.isFile && /\.epr$/i.test(name)) {
      const score = presets.scorePresetName(name);
      if (score >= 0) {
        hits.push({ path: entry.nativePath || name, name, score });
      }
    } else if (entry.isFolder) {
      await walkPresetFolder(entry, depth + 1, hits);
    }
  }
}

async function resolveAudioPreset(fs, settingsPath, homeDir) {
  if (settingsPath) {
    const chosen = await entryFromPath(fs, settingsPath);
    if (chosen) return settingsPath;
    throw new Error(
      `Audio preset not found: ${settingsPath}. Pick a valid MP3/WAV .epr in Settings, or save one from Adobe Media Encoder.`
    );
  }
  const roots = presets.defaultPresetRoots({ homeDir });
  const hits = [];
  for (let i = 0; i < roots.length; i += 1) {
    const folder = await entryFromPath(fs, roots[i]);
    if (folder && folder.isFolder) {
      await walkPresetFolder(folder, 0, hits);
    }
  }
  hits.sort((a, b) => b.score - a.score);
  if (hits[0]) return hits[0].path;
  return null;
}

async function createTempOutput(fs, extension) {
  const folder = await fs.getTemporaryFolder();
  const name = `birdcut-bounce-${Date.now()}.${extension || "wav"}`;
  const file = await folder.createFile(name, { overwrite: true });
  return file;
}

async function waitForBytes(uxp, file, { timeoutMs, minBytes, onProgress }) {
  const started = Date.now();
  let last = 0;
  while (Date.now() - started < timeoutMs) {
    try {
      const bytes = await readEntryBytes(uxp, file);
      const size = byteLengthOf(bytes);
      if (size >= minBytes) return bytes;
      if (size !== last) {
        last = size;
        progress(onProgress, "exporting", `Exporting audio… ${Math.round(size / 1024)} KB`);
      }
    } catch (_err) {
      /* file may not exist yet */
    }
    await sleep(400);
  }
  throw new Error("Export timed out waiting for bounced audio. Try an MP3 preset or a shorter sequence.");
}

function createAudioCapture({ ppro, uxp, tickToMs, call }) {
  const fs = uxp && uxp.storage && uxp.storage.localFileSystem;

  async function homeDir() {
    try {
      const os = require("os");
      if (os && typeof os.homedir === "function") return os.homedir();
    } catch (_err) {
      /* UXP may not expose os */
    }
    return "";
  }

  async function mediaInfoForClip(clip) {
    const start = await call(clip, "getStartTime");
    const end = await call(clip, "getEndTime");
    const inPoint = await call(clip, "getInPoint");
    const outPoint = await call(clip, "getOutPoint");
    const name = (await call(clip, "getName")) || "clip";
    let mediaPath = "";
    let projectItem = null;
    try {
      projectItem = await call(clip, "getProjectItem");
      const clipItem =
        ppro.ClipProjectItem && ppro.ClipProjectItem.cast ? ppro.ClipProjectItem.cast(projectItem) : projectItem;
      mediaPath = (await call(clipItem, "getMediaFilePath")) || "";
    } catch (_err) {
      mediaPath = "";
    }
    return {
      native: clip,
      name,
      mediaPath: String(mediaPath || ""),
      startMs: tickToMs(start),
      endMs: tickToMs(end),
      inPointMs: tickToMs(inPoint),
      outPointMs: tickToMs(outPoint),
      projectItem
    };
  }

  async function selectedClips(sequence) {
    if (!sequence || typeof sequence.getSelection !== "function") return [];
    const selection = await sequence.getSelection();
    if (!selection) return [];
    let items = [];
    try {
      items = (await selection.getTrackItems()) || [];
    } catch (_err) {
      items = [];
    }
    const detailed = [];
    for (let i = 0; i < items.length; i += 1) {
      detailed.push(await mediaInfoForClip(items[i]));
    }
    return detailed;
  }

  async function readDirectFile(nativePath) {
    const entry = await entryFromPath(fs, nativePath);
    if (!entry) {
      throw new Error(
        `Could not read media file (${nativePath}). Grant filesystem access (manifest localFileSystem=fullAccess) and confirm the file is online.`
      );
    }
    const bytes = await readEntryBytes(uxp, entry);
    const size = byteLengthOf(bytes);
    if (size < presets.MIN_AUDIO_BYTES) {
      throw new Error("Empty audio: the media file is too small to transcribe.");
    }
    if (size > presets.WHISPER_MAX_BYTES) {
      throw new Error(
        `File too large for Whisper (${Math.round(size / (1024 * 1024))} MB > 25 MB). BirdCut will bounce audio instead if a preset is available.`
      );
    }
    return bytes;
  }

  async function bounceWithEncoder({ sequence, clipInfo, presetPath, onProgress, exportFull }) {
    if (!fs) {
      throw new Error("UXP filesystem is unavailable; cannot write bounced audio.");
    }
    const resolvedPreset = await resolveAudioPreset(fs, presetPath, await homeDir());
    if (!resolvedPreset) {
      throw new Error(
        "No audio-only .epr preset found. In Adobe Media Encoder: Format → MP3 or WAV, save a preset, then set its .epr path in BirdCut Settings (Choose .epr…). Premiere UXP cannot list AME presets."
      );
    }
    const manager = await getEncoderManager(ppro);
    const ext = resolvedPreset
      ? ((await call(manager, "getExportFileExtension", sequence, resolvedPreset)) || "wav").replace(/^\./, "")
      : "wav";
    const outFile = await createTempOutput(fs, ext);
    const outputPath = outFile.nativePath;

    progress(onProgress, "exporting", `Exporting audio with ${String(resolvedPreset).split(/[/\\]/).pop()}…`);

    let renderError = null;
    let renderDone = false;
    const onComplete = () => {
      renderDone = true;
    };
    const onError = (event) => {
      renderError = (event && (event.message || event.error)) || "Encoder render error";
    };
    try {
      if (ppro.EventManager && typeof ppro.EventManager.addEventListener === "function") {
        await ppro.EventManager.addEventListener(manager, ppro.EncoderManager.EVENT_RENDER_COMPLETE, onComplete);
        await ppro.EventManager.addEventListener(manager, ppro.EncoderManager.EVENT_RENDER_ERROR, onError);
      }
    } catch (_err) {
      /* listeners are optional */
    }

    let ok = false;
    try {
      if (clipInfo && clipInfo.mediaPath && typeof manager.encodeFile === "function") {
        const inTick = ppro.TickTime.createWithSeconds((clipInfo.inPointMs || 0) / 1000);
        const outTick = ppro.TickTime.createWithSeconds((clipInfo.outPointMs || clipInfo.endMs) / 1000);
        ok = await manager.encodeFile(
          clipInfo.mediaPath,
          outputPath,
          resolvedPreset,
          inTick,
          outTick,
          0,
          true,
          true
        );
      } else if (clipInfo && clipInfo.projectItem && typeof manager.encodeProjectItem === "function") {
        ok = await manager.encodeProjectItem(
          clipInfo.projectItem,
          outputPath,
          resolvedPreset,
          0,
          true,
          true
        );
      } else {
        const type = exportTypeImmediately(ppro, manager);
        ok = await manager.exportSequence(sequence, type, outputPath, resolvedPreset, exportFull !== false);
      }
    } catch (err) {
      throw new Error(err.message || String(err));
    }

    if (renderError) throw new Error(String(renderError));
    if (!ok && !renderDone) {
      progress(onProgress, "exporting", "Waiting for encoder…");
    }

    const bytes = await waitForBytes(uxp, outFile, {
      timeoutMs: 8 * 60 * 1000,
      minBytes: presets.MIN_AUDIO_BYTES,
      onProgress
    });
    if (byteLengthOf(bytes) < presets.MIN_AUDIO_BYTES) {
      throw new Error("Empty audio: export produced a tiny file. Check that the sequence has audio.");
    }
    if (byteLengthOf(bytes) > presets.WHISPER_MAX_BYTES) {
      throw new Error(
        `File too large for Whisper (${Math.round(byteLengthOf(bytes) / (1024 * 1024))} MB). Use an MP3 .epr preset or transcribe a shorter clip.`
      );
    }
    return { bytes, fileName: outFile.name || `bounce.${ext}`, mimeType: presets.mimeForPath(outFile.name || ext) };
  }

  return {
    async captureAudio({ source, presetPath, onProgress } = {}) {
      if (!ppro || !ppro.Project) {
        throw new Error("Premiere is not available. Load BirdCut inside Premiere to transcribe a sequence.");
      }
      const project = await ppro.Project.getActiveProject();
      if (!project) throw new Error("No active Premiere project.");
      const sequence = await project.getActiveSequence();
      if (!sequence) throw new Error("No active sequence. Open a sequence in the timeline.");

      const wantClip = source === "clip" || source === "selection";
      if (wantClip) {
        progress(onProgress, "exporting", "Reading selected clip…");
        const clips = await selectedClips(sequence);
        if (!clips.length) {
          throw new Error("No clip selected. Select a clip on the timeline, then Transcribe clip.");
        }
        clips.sort((a, b) => a.startMs - b.startMs);
        const primary = clips.find((clip) => clip.mediaPath) || clips[0];
        if (primary.mediaPath) {
          try {
            progress(onProgress, "exporting", `Reading ${primary.name} from disk…`);
            const bytes = await readDirectFile(primary.mediaPath);
            if (presets.canSendFileDirectly(primary.mediaPath, byteLengthOf(bytes))) {
              return {
                audioBytes: bytes,
                fileName: primary.mediaPath.split(/[/\\]/).pop(),
                mimeType: presets.mimeForPath(primary.mediaPath),
                alignment: {
                  kind: "media",
                  clipStartMs: primary.startMs,
                  mediaInPointMs: primary.inPointMs,
                  mediaOutPointMs: primary.outPointMs,
                  label: primary.name
                },
                method: "media-path"
              };
            }
          } catch (err) {
            if (/file too large/i.test(err.message || "")) {
              progress(onProgress, "exporting", "Source is over Whisper’s size limit — bouncing audio…");
            } else {
              progress(onProgress, "exporting", `${err.message} Falling back to bounce…`);
            }
          }
        }
        const bounced = await bounceWithEncoder({
          sequence,
          clipInfo: primary,
          presetPath,
          onProgress,
          exportFull: true
        });
        return {
          audioBytes: bounced.bytes,
          fileName: bounced.fileName,
          mimeType: bounced.mimeType,
          alignment: {
            kind: "sequence",
            offsetMs: primary.startMs,
            label: primary.name
          },
          method: "encode-clip"
        };
      }

      progress(onProgress, "exporting", "Bouncing active sequence audio…");
      const bounced = await bounceWithEncoder({
        sequence,
        clipInfo: null,
        presetPath,
        onProgress,
        exportFull: true
      });
      const seqIn = tickToMs(await call(sequence, "getInPoint"));
      return {
        audioBytes: bounced.bytes,
        fileName: bounced.fileName,
        mimeType: bounced.mimeType,
        alignment: {
          kind: "sequence",
          offsetMs: 0,
          sequenceInPointMs: seqIn,
          label: sequence.name || "Sequence"
        },
        method: "export-sequence"
      };
    }
  };
}

const api = {
  createAudioCapture,
  fileUrl,
  byteLengthOf,
  resolveAudioPreset,
  getEncoderManager
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutBounce = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
