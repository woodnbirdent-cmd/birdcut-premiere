"use strict";
(function (root) {
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function progress(onProgress, stage, message) {
  if (typeof onProgress === "function") onProgress({ stage, message });
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

const adobeJson = loadJson();
const adobeLang = loadLang();
const align = loadAlign();

async function asClipProjectItem(ppro, projectItem) {
  if (!projectItem) return null;
  const clipItem =
    ppro.ClipProjectItem && typeof ppro.ClipProjectItem.cast === "function"
      ? ppro.ClipProjectItem.cast(projectItem)
      : projectItem;
  if (!clipItem) return null;
  try {
    if (typeof clipItem.isSequence === "function" && (await clipItem.isSequence())) return null;
  } catch (_err) {
    /* not a sequence, or API missing */
  }
  return clipItem;
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

async function exportReadyJson(T, clipItem, { timeoutMs, onProgress, name }) {
  const deadline = Date.now() + (timeoutMs || 10 * 60 * 1000);
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      if (typeof T.hasTranscript === "function" && !T.hasTranscript(clipItem)) {
        progress(onProgress, "transcribing", `Transcribing in Premiere… (${name || "clip"})`);
        await sleep(800);
        continue;
      }
      progress(onProgress, "exporting", `Exporting transcript… (${name || "clip"})`);
      const raw = await T.exportToJSON(clipItem);
      const parsed = adobeJson.parseAdobeJson(raw);
      if (looksPopulated(parsed)) return parsed;
      lastErr = new Error("exportToJSON returned no segments yet");
    } catch (err) {
      lastErr = err;
    }
    await sleep(800);
  }
  throw new Error(
    (lastErr && lastErr.message) ||
      `Timed out waiting for Adobe Speech to Text on ${name || "the clip"}. Check Window → Text in Premiere.`
  );
}

async function transcribeOne(T, clipItem, { languageCode, onProgress, name, timeoutMs }) {
  const label = name || clipItem.name || "clip";
  const already = typeof T.hasTranscript === "function" && T.hasTranscript(clipItem);
  if (already) {
    progress(onProgress, "exporting", `Using existing Premiere transcript (${label})…`);
    return exportReadyJson(T, clipItem, { timeoutMs, onProgress, name: label });
  }
  if (typeof T.transcribeClipProjectItem !== "function") {
    throw new Error("Transcript.transcribeClipProjectItem is missing. Update Premiere Pro to 25.6 or later.");
  }
  progress(onProgress, "transcribing", `Transcribing in Premiere… (${label})`);
  let ok = false;
  try {
    ok = languageCode
      ? await T.transcribeClipProjectItem(clipItem, { language: languageCode })
      : await T.transcribeClipProjectItem(clipItem);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (languageCode && /unsupported|language/i.test(msg)) {
      progress(onProgress, "transcribing", "Language code not accepted — using Premiere’s default…");
      ok = await T.transcribeClipProjectItem(clipItem);
    } else {
      throw err;
    }
  }
  if (!ok) {
    throw new Error(
      `Adobe Speech to Text failed for ${label}. Install an on-device language pack in Premiere (Window → Text), or check Adobe cloud credits.`
    );
  }
  return exportReadyJson(T, clipItem, { timeoutMs, onProgress, name: label });
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
    try {
      projectItem = await call(clip, "getProjectItem");
      const clipItem = await asClipProjectItem(ppro, projectItem);
      mediaPath = clipItem ? (await call(clipItem, "getMediaFilePath")) || "" : "";
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
        mediaType: mediaType || "video"
      };
    }
  }

  async function selectedPlacements(sequence) {
    if (!sequence || typeof sequence.getSelection !== "function") return [];
    const selection = await sequence.getSelection();
    if (!selection) return [];
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
    return out.filter((item) => item.clipItem);
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
    return preferred;
  }

  function sourceKey(item) {
    return item.mediaPath ? `path:${item.mediaPath}` : `name:${item.name}`;
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
    async captureAdobe({ source, language, onProgress } = {}) {
      const T = transcriptApi(ppro);
      const project = await ppro.Project.getActiveProject();
      if (!project) throw new Error("No active Premiere project.");
      const sequence = await project.getActiveSequence();
      if (!sequence) throw new Error("No active sequence. Open a sequence in the timeline.");

      const wantClip = source === "clip" || source === "selection";
      const placements = wantClip ? await selectedPlacements(sequence) : await sequencePlacements(sequence);
      if (!placements.length) {
        if (wantClip) {
          throw new Error(
            "No timeline clip selected. Select a source clip (Adobe Speech to Text is per ClipProjectItem), then Transcribe clip."
          );
        }
        throw new Error(
          "No source clips found on the active sequence. Select a clip on the timeline (Adobe STT is per source clip), then Transcribe clip."
        );
      }

      const supported = typeof T.querySupportedLanguages === "function" ? T.querySupportedLanguages() || [] : [];
      const languageCode = adobeLang.resolveAdobeLanguage(language, supported);

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
          "transcribing",
          `Transcribing in Premiere… (${index}/${unique.size}) ${item.name}`
        );
        jsonBySource.set(key, await transcribeOne(T, item.clipItem, {
          languageCode,
          onProgress,
          name: item.name
        }));
      }

      progress(onProgress, "mapping", "Mapping words onto the sequence…");
      const mapped = placements.map((item) => {
        const json = jsonBySource.get(sourceKey(item));
        const transcript = adobeJson.mapAdobeTranscript(json, { label: item.name });
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
        : sequence.name || "Sequence";
      return adobeJson.mergeAdobeTranscripts(mapped, { label });
    }
  };
}

const api = { createAdobeStt, asClipProjectItem, transcribeOne, exportReadyJson };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutAdobeStt = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
