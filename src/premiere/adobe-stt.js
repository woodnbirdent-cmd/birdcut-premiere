"use strict";
(function (root) {
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_POLL_MS = 1500;
const HEARTBEAT_MS = 2000;
const PACKS_CREDITS_MESSAGE =
  "Adobe Speech to Text returned false (no transcript started). Install an on-device language pack in Premiere (Window → Text), or check Adobe cloud credits.";
const NESTED_SEQUENCE_MESSAGE =
  "The selected item is a nested sequence. Adobe Speech to Text cannot transcribe sequences. Select a source clip in the Project panel (a ClipProjectItem that is not a sequence).";
const SELECT_CLIP_MESSAGE =
  "Select a source clip in the Project panel (preferred) or on the timeline, then Transcribe clip / Import Premiere transcript. Nested sequences cannot be transcribed.";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function progress(onProgress, stage, message) {
  if (typeof onProgress === "function") onProgress({ stage, message });
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function loadJson() {
  if (typeof require === "function") {
    try {
      return require("../stt/adobe-json");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutAdobeJson || {};
}

function loadLang() {
  if (typeof require === "function") {
    try {
      return require("../stt/adobe-language");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutAdobeLanguage || {};
}

function loadAlign() {
  if (typeof require === "function") {
    try {
      return require("../stt/align-transcript");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutAlign || {};
}

function loadErrors() {
  if (typeof require === "function") {
    try {
      return require("../stt/errors");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutErrors || {};
}

const adobeJson = loadJson();
const adobeLang = loadLang();
const align = loadAlign();
const errors = loadErrors();

function throwIfUnknown(err) {
  if (errors.isPremiereUnknownSttError && errors.isPremiereUnknownSttError(err)) {
    throw new Error(
      errors.PREMIERE_UNKNOWN_STT_MESSAGE ||
        "Premiere Speech to Text failed (error -1609629681). Install an on-device language pack in Window → Text, select the source clip in the Project panel, or transcribe once in Premiere’s Text panel and run BirdCut Clip to import."
    );
  }
}

async function inspectClipProjectItem(ppro, projectItem) {
  if (!projectItem) return { clipItem: null, nested: false };
  const clipItem =
    ppro.ClipProjectItem && typeof ppro.ClipProjectItem.cast === "function"
      ? ppro.ClipProjectItem.cast(projectItem)
      : projectItem;
  if (!clipItem) return { clipItem: null, nested: false };
  let nested = false;
  try {
    if (typeof clipItem.isSequence === "function" && (await clipItem.isSequence())) nested = true;
  } catch (_err) {
    nested = false;
  }
  return { clipItem, nested };
}

async function asClipProjectItem(ppro, projectItem) {
  const inspected = await inspectClipProjectItem(ppro, projectItem);
  if (!inspected.clipItem || inspected.nested) return null;
  return inspected.clipItem;
}

function transcriptApi(ppro) {
  const T = ppro && ppro.Transcript;
  if (!T || typeof T.exportToJSON !== "function") {
    throw new Error(
      "Adobe Speech to Text is not available in this Premiere build. BirdCut needs Premiere 25.6+ (Transcript.transcribeClipProjectItem)."
    );
  }
  return T;
}

function looksPopulated(parsed) {
  return parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0;
}

function clipHasTranscript(T, clipItem) {
  if (!T || typeof T.hasTranscript !== "function") return null;
  try {
    return Boolean(T.hasTranscript(clipItem));
  } catch (_err) {
    return null;
  }
}

async function awaitWithHeartbeat(work, { onProgress, name, stage, prefix }) {
  const started = Date.now();
  let settled = null;
  const pending = Promise.resolve(work).then(
    (value) => {
      settled = { ok: true, value };
    },
    (err) => {
      settled = { ok: false, err };
    }
  );
  while (!settled) {
    const elapsed = formatElapsed(Date.now() - started);
    progress(
      onProgress,
      stage || "transcribing",
      `${prefix || "Transcribing in Premiere…"} ${elapsed} elapsed (${name || "clip"}). Large clips can take several minutes.`
    );
    await Promise.race([pending, sleep(HEARTBEAT_MS)]);
  }
  await pending;
  if (!settled.ok) throw settled.err;
  return settled.value;
}

function invokeTranscribe(T, clipItem, languageCode) {
  if (languageCode) return T.transcribeClipProjectItem(clipItem, { language: languageCode });
  return T.transcribeClipProjectItem(clipItem);
}

async function exportReadyJson(T, clipItem, { timeoutMs, onProgress, name, pollMs, importOnly } = {}) {
  const limit = timeoutMs || DEFAULT_TIMEOUT_MS;
  const interval = pollMs || DEFAULT_POLL_MS;
  const deadline = Date.now() + limit;
  const started = Date.now();
  let lastErr = null;
  const label = name || "clip";
  while (Date.now() < deadline) {
    const elapsed = formatElapsed(Date.now() - started);
    const known = clipHasTranscript(T, clipItem);
    try {
      if (known === false) {
        if (importOnly) {
          throw new Error(
            `No Premiere transcript on ${label}. Transcribe once in Premiere’s Text panel, then run BirdCut Import Premiere transcript.`
          );
        }
        progress(
          onProgress,
          "transcribing",
          `Waiting for Premiere Speech to Text… ${elapsed} elapsed (${label}). Still running — this is not stuck.`
        );
        await sleep(interval);
        continue;
      }
      progress(onProgress, "exporting", `Exporting transcript… ${elapsed} elapsed (${label})`);
      const raw = await T.exportToJSON(clipItem);
      const parsed = adobeJson.parseAdobeJson(raw);
      if (looksPopulated(parsed)) return parsed;
      lastErr = new Error("exportToJSON returned no segments yet");
    } catch (err) {
      throwIfUnknown(err);
      if (importOnly && /no premiere transcript/i.test((err && err.message) || "")) throw err;
      lastErr = err;
    }
    await sleep(interval);
  }
  const waited = formatElapsed(limit);
  throw new Error(
    (lastErr && lastErr.message) ||
      `Timed out after ${waited} waiting for Adobe Speech to Text on ${label}. Premiere may still be transcribing — open Window → Text, or Import Premiere transcript after it finishes.`
  );
}

async function transcribeOne(T, clipItem, { languageCode, onProgress, name, timeoutMs, pollMs, importOnly } = {}) {
  const label = name || clipItem.name || "clip";
  const waitOpts = { timeoutMs, onProgress, name: label, pollMs, importOnly: Boolean(importOnly) };
  const knownHas = clipHasTranscript(T, clipItem);

  if (knownHas === true) {
    progress(onProgress, "exporting", `Using existing Premiere transcript (${label})…`);
    return exportReadyJson(T, clipItem, waitOpts);
  }

  if (knownHas == null && typeof T.exportToJSON === "function") {
    try {
      const raw = await T.exportToJSON(clipItem);
      const parsed = adobeJson.parseAdobeJson(raw);
      if (looksPopulated(parsed)) {
        progress(onProgress, "exporting", `Using existing Premiere transcript (${label})…`);
        return parsed;
      }
    } catch (err) {
      if (importOnly) {
        throwIfUnknown(err);
      }
    }
  }

  if (importOnly) {
    throw new Error(
      `No Premiere transcript on ${label}. Transcribe once in Premiere’s Text panel, then run BirdCut Import Premiere transcript.`
    );
  }

  if (typeof T.transcribeClipProjectItem !== "function") {
    throw new Error("Transcript.transcribeClipProjectItem is missing. Update Premiere Pro to 25.6 or later.");
  }

  const heartbeat = {
    onProgress,
    name: label,
    stage: "transcribing",
    prefix: "Transcribing in Premiere…"
  };

  let ok = false;
  let lastErr = null;
  try {
    progress(onProgress, "transcribing", `Transcribing in Premiere… 0:00 elapsed (${label}). Large clips can take several minutes.`);
    ok = await awaitWithHeartbeat(invokeTranscribe(T, clipItem, languageCode), heartbeat);
  } catch (err) {
    lastErr = err;
    ok = false;
  }

  if (!ok && languageCode) {
    progress(
      onProgress,
      "transcribing",
      "Premiere rejected the language option — retrying with Premiere’s default (no language code)…"
    );
    try {
      ok = await awaitWithHeartbeat(invokeTranscribe(T, clipItem, ""), heartbeat);
      lastErr = null;
    } catch (err) {
      lastErr = err;
      ok = false;
    }
  }

  if (lastErr) {
    throwIfUnknown(lastErr);
    throw lastErr;
  }
  if (!ok) {
    throw new Error(`${PACKS_CREDITS_MESSAGE} (${label})`);
  }
  return exportReadyJson(T, clipItem, waitOpts);
}

function createAdobeStt({ ppro, call, tickToMs }) {
  async function mediaInfo(clip, mediaType) {
    const start = await call(clip, "getStartTime");
    const end = await call(clip, "getEndTime");
    const inPoint = await call(clip, "getInPoint");
    const outPoint = await call(clip, "getOutPoint");
    const name = (await call(clip, "getName")) || "clip";
    let projectItem = null;
    let mediaPath = "";
    let clipItem = null;
    let nested = false;
    try {
      projectItem = await call(clip, "getProjectItem");
      const inspected = await inspectClipProjectItem(ppro, projectItem);
      clipItem = inspected.nested ? null : inspected.clipItem;
      nested = inspected.nested;
      mediaPath = inspected.clipItem ? (await call(inspected.clipItem, "getMediaFilePath")) || "" : "";
      return {
        native: clip,
        name,
        mediaPath: String(mediaPath || ""),
        startMs: tickToMs(start),
        endMs: tickToMs(end),
        inPointMs: tickToMs(inPoint),
        outPointMs: tickToMs(outPoint),
        projectItem,
        clipItem,
        nested,
        origin: "timeline",
        mediaType: mediaType || "video"
      };
    } catch (_err) {
      return {
        native: clip,
        name,
        mediaPath: "",
        startMs: tickToMs(start),
        endMs: tickToMs(end),
        inPointMs: tickToMs(inPoint),
        outPointMs: tickToMs(outPoint),
        projectItem,
        clipItem: null,
        nested,
        origin: "timeline",
        mediaType: mediaType || "video"
      };
    }
  }

  async function selectedPlacements(sequence) {
    if (!sequence || typeof sequence.getSelection !== "function") return { clips: [], nested: 0 };
    const selection = await sequence.getSelection();
    if (!selection) return { clips: [], nested: 0 };
    let items = [];
    try {
      items = (await selection.getTrackItems()) || [];
    } catch (_err) {
      items = [];
    }
    const out = [];
    for (let i = 0; i < items.length; i += 1) {
      out.push(await mediaInfo(items[i], "selection"));
    }
    return {
      clips: out.filter((item) => item.clipItem),
      nested: out.filter((item) => item.nested).length
    };
  }

  async function projectPanelPlacements(project) {
    if (!ppro.ProjectUtils || typeof ppro.ProjectUtils.getSelection !== "function") {
      return { clips: [], nested: 0 };
    }
    let selection = null;
    try {
      selection = await ppro.ProjectUtils.getSelection(project);
    } catch (_err) {
      return { clips: [], nested: 0 };
    }
    if (!selection || typeof selection.getItems !== "function") return { clips: [], nested: 0 };
    let items = [];
    try {
      items = (await selection.getItems()) || [];
    } catch (_err) {
      items = [];
    }
    const clips = [];
    let nested = 0;
    for (let i = 0; i < items.length; i += 1) {
      const inspected = await inspectClipProjectItem(ppro, items[i]);
      if (inspected.nested) {
        nested += 1;
        continue;
      }
      if (!inspected.clipItem) continue;
      const name =
        inspected.clipItem.name || (await call(inspected.clipItem, "getName")) || items[i].name || "clip";
      let mediaPath = "";
      try {
        mediaPath = (await call(inspected.clipItem, "getMediaFilePath")) || "";
      } catch (_err) {
        mediaPath = "";
      }
      clips.push({
        native: null,
        name,
        mediaPath: String(mediaPath || ""),
        startMs: 0,
        endMs: 0,
        inPointMs: 0,
        outPointMs: 0,
        projectItem: items[i],
        clipItem: inspected.clipItem,
        nested: false,
        origin: "project",
        mediaType: "project"
      });
    }
    return { clips, nested };
  }

  async function sequencePlacements(sequence) {
    const items = [];
    const videoCount = (await call(sequence, "getVideoTrackCount")) || 0;
    const audioCount = (await call(sequence, "getAudioTrackCount")) || 0;
    async function readTrack(getter, count, mediaType) {
      for (let index = 0; index < count; index += 1) {
        const track = await getter.call(sequence, index);
        if (!track || typeof track.getTrackItems !== "function") continue;
        let clips = [];
        try {
          clips = track.getTrackItems(1, false) || [];
        } catch (_err) {
          try {
            clips = (await track.getTrackItems()) || [];
          } catch (_err2) {
            clips = [];
          }
        }
        for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
          items.push(await mediaInfo(clips[clipIndex], mediaType));
        }
      }
    }
    await readTrack(sequence.getVideoTrack, videoCount, "video");
    await readTrack(sequence.getAudioTrack, audioCount, "audio");
    const nested = items.filter((item) => item.nested).length;
    const usable = items.filter((item) => item.clipItem);
    const seenRange = new Set();
    const preferred = [];
    usable
      .sort((a, b) => {
        if (a.mediaType === b.mediaType) return a.startMs - b.startMs;
        return a.mediaType === "video" ? -1 : 1;
      })
      .forEach((item) => {
        const key = `${item.mediaPath || item.name}|${item.startMs}|${item.endMs}`;
        if (seenRange.has(key)) return;
        seenRange.add(key);
        preferred.push(item);
      });
    return { clips: preferred, nested };
  }

  function sourceKey(item) {
    return item.mediaPath ? `path:${item.mediaPath}` : `name:${item.name}`;
  }

  function resolveLanguage(T, language, onProgress) {
    let supported = [];
    try {
      supported = typeof T.querySupportedLanguages === "function" ? T.querySupportedLanguages() || [] : [];
    } catch (_err) {
      supported = [];
    }
    const packFn = typeof T.isLanguagePackAvailable === "function" ? (code) => T.isLanguagePackAvailable(code) : null;
    const resolved =
      adobeLang.languageForTranscribe && adobeLang.languageForTranscribe(language, supported, packFn);
    const lang = resolved || { languageCode: "", reason: "none" };
    if (lang.reason === "pack-unavailable") {
      progress(
        onProgress,
        "transcribing",
        `Language pack ${lang.skippedCode} is not installed — using Premiere’s default (no language option). Install a pack in Window → Text.`
      );
    } else if (lang.reason === "unverified") {
      progress(
        onProgress,
        "transcribing",
        `Premiere did not list language packs — omitting ${lang.skippedCode || "language"} to avoid error -1609629681.`
      );
    } else if (lang.reason === "pack-check-failed") {
      progress(
        onProgress,
        "transcribing",
        "Could not check language packs — omitting the language option and using Premiere’s default."
      );
    }
    return lang.languageCode || "";
  }

  return {
    queryLanguages() {
      try {
        const T = ppro && ppro.Transcript;
        if (!T || typeof T.querySupportedLanguages !== "function") return [];
        const list = T.querySupportedLanguages() || [];
        return list.map((item) => ({
          displayString: item.displayString || item.languageCode || "",
          languageCode: item.languageCode || "",
          locale: item.locale || "",
          packAvailable:
            typeof T.isLanguagePackAvailable === "function" && item.languageCode
              ? Boolean(T.isLanguagePackAvailable(item.languageCode))
              : null
        }));
      } catch (_err) {
        return [];
      }
    },
    async captureAdobe({ source, language, onProgress, importOnly, timeoutMs, pollMs } = {}) {
      const T = transcriptApi(ppro);
      const project = await ppro.Project.getActiveProject();
      if (!project) throw new Error("No active Premiere project.");
      let sequence = null;
      try {
        sequence = await project.getActiveSequence();
      } catch (_err) {
        sequence = null;
      }

      const wantClip = source === "clip" || source === "selection" || source === "import";
      const onlyExport = Boolean(importOnly) || source === "import";
      let placements = [];
      let nestedCount = 0;

      if (wantClip) {
        const projectSel = await projectPanelPlacements(project);
        nestedCount += projectSel.nested;
        if (projectSel.clips.length) {
          placements = projectSel.clips;
        } else if (sequence) {
          const timelineSel = await selectedPlacements(sequence);
          nestedCount += timelineSel.nested;
          placements = timelineSel.clips;
        }
        if (!placements.length) {
          if (nestedCount) throw new Error(NESTED_SEQUENCE_MESSAGE);
          throw new Error(SELECT_CLIP_MESSAGE);
        }
      } else {
        if (!sequence) throw new Error("No active sequence. Open a sequence in the timeline.");
        const seqSel = await sequencePlacements(sequence);
        nestedCount = seqSel.nested;
        placements = seqSel.clips;
        if (!placements.length) {
          if (nestedCount) throw new Error(NESTED_SEQUENCE_MESSAGE);
          throw new Error(
            "No source clips found on the active sequence. Select a clip in the Project panel (Adobe STT is per ClipProjectItem), then Transcribe clip."
          );
        }
        if (nestedCount) {
          progress(
            onProgress,
            "transcribing",
            `Skipping ${nestedCount} nested sequence(s) — Adobe Speech to Text only runs on source clips.`
          );
        }
      }

      const languageCode = onlyExport ? "" : resolveLanguage(T, language, onProgress);

      const unique = new Map();
      placements.forEach((item) => {
        const key = sourceKey(item);
        if (!unique.has(key)) unique.set(key, item);
      });

      const jsonBySource = new Map();
      let index = 0;
      for (const [key, item] of unique.entries()) {
        index += 1;
        progress(
          onProgress,
          onlyExport ? "exporting" : "transcribing",
          `${onlyExport ? "Importing Premiere transcript" : "Transcribing in Premiere"}… (${index}/${unique.size}) ${item.name}`
        );
        jsonBySource.set(
          key,
          await transcribeOne(T, item.clipItem, {
            languageCode,
            onProgress,
            name: item.name,
            timeoutMs: timeoutMs || DEFAULT_TIMEOUT_MS,
            pollMs,
            importOnly: onlyExport
          })
        );
      }

      progress(onProgress, "mapping", "Mapping words onto the sequence…");
      const mapped = placements.map((item) => {
        const json = jsonBySource.get(sourceKey(item));
        const transcript = adobeJson.mapAdobeTranscript(json, { label: item.name });
        if (item.origin === "project" || !align.applyAlignment) return transcript;
        return align.applyAlignment(transcript, {
          kind: "media",
          clipStartMs: item.startMs,
          mediaInPointMs: item.inPointMs,
          mediaOutPointMs: item.outPointMs,
          label: item.name
        });
      });
      const label = wantClip
        ? placements.map((item) => item.name).join(", ")
        : (sequence && sequence.name) || "Sequence";
      return adobeJson.mergeAdobeTranscripts(mapped, { label });
    }
  };
}

const api = {
  createAdobeStt,
  asClipProjectItem,
  inspectClipProjectItem,
  transcribeOne,
  exportReadyJson,
  DEFAULT_TIMEOUT_MS
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutAdobeStt = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
