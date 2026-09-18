"use strict";
(function (root) {
function tickToMs(tickTime) {
  if (tickTime == null) return 0;
  if (typeof tickTime === "number") return Math.round(tickTime * 1000);
  if (typeof tickTime.seconds === "number") return Math.round(tickTime.seconds * 1000);
  if (typeof tickTime.asSeconds === "function") return Math.round(tickTime.asSeconds() * 1000);
  if (typeof tickTime.getSeconds === "function") return Math.round(tickTime.getSeconds() * 1000);
  if (typeof tickTime.seconds === "function") return Math.round(tickTime.seconds() * 1000);
  if (tickTime.ticks != null) {
    const ticks = Number(tickTime.ticks);
    if (Number.isFinite(ticks)) return Math.round((ticks / 254016000000) * 1000);
  }
  return 0;
}

async function call(object, method, ...args) {
  if (!object || typeof object[method] !== "function") return null;
  return object[method](...args);
}

function loadBounce() {
  if (typeof require === "function") {
    try {
      return require("./bounce-audio");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutBounce || {};
}

function loadAdobeStt() {
  if (typeof require === "function") {
    try {
      return require("./adobe-stt");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutAdobeStt || {};
}

function loadApplyCaptions() {
  if (typeof require === "function") {
    try {
      return require("./apply-captions");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutApplyCaptions || {};
}

const bounce = loadBounce();
const adobeSttApi = loadAdobeStt();
const applyCaptionsApi = loadApplyCaptions();

function createUnavailableHost() {
  return {
    available: false,
    name: "offline",
    async getStatus() {
      return {
        available: false,
        projectName: "",
        sequenceName: "",
        message: "Premiere Pro UXP host is not available. Running in demo/preview mode."
      };
    },
    async getSequenceSnapshot() {
      return { sequenceName: "", durationMs: 0, items: [], mediaPaths: [] };
    },
    async applyCutPlan() {
      return {
        ok: false,
        applied: false,
        message: "Premiere APIs are not available in this environment. Cut plan was not applied."
      };
    },
    async pickAudioFile() {
      return null;
    },
    async captureAudio() {
      throw new Error("Premiere is not available. Use mock mode, or load BirdCut inside Premiere to transcribe a sequence.");
    },
    async transcribeAdobe() {
      throw new Error("Adobe Speech to Text needs Premiere Pro. Load BirdCut inside Premiere 26.");
    },
    async queryAdobeLanguages() {
      return [];
    },
    async pickPresetFile() {
      return null;
    },
    async saveTextFile() {
      return { ok: false, message: "File picker is not available outside Premiere UXP." };
    },
    async addCaptionsToSequence() {
      return {
        ok: false,
        applied: false,
        message: "Premiere APIs are not available in this environment. Export SRT instead, or load BirdCut inside Premiere."
      };
    },
    async setPlayerPosition() {
      return false;
    }
  };
}

function createPremiereHost(overrides) {
  let ppro = null;
  let uxp = null;
  try {
    if (typeof require === "function") {
      ppro = require("premierepro");
      uxp = require("uxp");
    }
  } catch (_err) {
    return createUnavailableHost();
  }
  if (!ppro || !ppro.Project) {
    return Object.assign(createUnavailableHost(), overrides || {});
  }

  async function getProjectAndSequence() {
    const project = await ppro.Project.getActiveProject();
    if (!project) throw new Error("No active Premiere project.");
    const sequence = await project.getActiveSequence();
    if (!sequence) throw new Error("No active sequence. Open a sequence in the timeline.");
    return { project, sequence };
  }

  async function collectTrackItems(sequence) {
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
          const clip = clips[clipIndex];
          const start = await call(clip, "getStartTime");
          const end = await call(clip, "getEndTime");
          const inPoint = await call(clip, "getInPoint");
          const outPoint = await call(clip, "getOutPoint");
          const name = (await call(clip, "getName")) || `${mediaType}-${index}-${clipIndex}`;
          items.push({
            id: `${mediaType}:${index}:${clipIndex}:${name}`,
            name,
            native: clip,
            startMs: tickToMs(start),
            endMs: tickToMs(end),
            inPointMs: tickToMs(inPoint),
            outPointMs: tickToMs(outPoint),
            trackIndex: index,
            mediaType
          });
        }
      }
    }
    await readTrack(sequence.getVideoTrack, videoCount, "video");
    await readTrack(sequence.getAudioTrack, audioCount, "audio");
    return items;
  }

  const capture = bounce.createAudioCapture
    ? bounce.createAudioCapture({ ppro, uxp, tickToMs, call })
    : null;
  const adobe = adobeSttApi.createAdobeStt
    ? adobeSttApi.createAdobeStt({ ppro, call, tickToMs })
    : null;

  async function collectMediaPaths(items) {
    const paths = [];
    for (const item of items) {
      try {
        const projectItem = await call(item.native, "getProjectItem");
        if (!projectItem) continue;
        const clipItem = ppro.ClipProjectItem && ppro.ClipProjectItem.cast
          ? ppro.ClipProjectItem.cast(projectItem)
          : projectItem;
        const mediaPath = await call(clipItem, "getMediaFilePath");
        if (mediaPath) paths.push(String(mediaPath));
      } catch (_err) {
        /* skip items without a file path */
      }
    }
    return Array.from(new Set(paths));
  }

  return {
    available: true,
    name: "premierepro",
    async getStatus() {
      try {
        const { project, sequence } = await getProjectAndSequence();
        const end = await call(sequence, "getEndTime");
        return {
          available: true,
          projectName: project.name || "Project",
          sequenceName: sequence.name || "Sequence",
          durationMs: tickToMs(end),
          message: `${sequence.name} — ready`
        };
      } catch (err) {
        return {
          available: true,
          projectName: "",
          sequenceName: "",
          durationMs: 0,
          message: err.message || String(err)
        };
      }
    },
    async getSequenceSnapshot() {
      const { sequence } = await getProjectAndSequence();
      const items = await collectTrackItems(sequence);
      const mediaPaths = await collectMediaPaths(items);
      const end = await call(sequence, "getEndTime");
      return {
        sequenceName: sequence.name || "Sequence",
        durationMs: tickToMs(end),
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          startMs: item.startMs,
          endMs: item.endMs,
          inPointMs: item.inPointMs,
          outPointMs: item.outPointMs,
          trackIndex: item.trackIndex,
          mediaType: item.mediaType
        })),
        nativeItems: items,
        mediaPaths,
        sequence
      };
    },
    async applyCutPlan(plan, executeOps) {
      if (typeof executeOps === "function") {
        return executeOps(ppro, plan, this);
      }
      const apply = (overrides && overrides.applyCutPlanImpl) || null;
      if (apply) return apply(ppro, plan, this);
      throw new Error("Apply implementation missing.");
    },
    async addCaptionsToSequence(payload, executeCaptions) {
      if (typeof executeCaptions === "function") {
        return executeCaptions(ppro, uxp, this, payload);
      }
      const impl = (overrides && overrides.addCaptionsImpl) || applyCaptionsApi.addCaptionsToSequence;
      if (typeof impl === "function") return impl(ppro, uxp, this, payload);
      throw new Error("Add-captions implementation missing.");
    },
    async pickAudioFile() {
      const fs = uxp && uxp.storage && uxp.storage.localFileSystem;
      if (!fs || typeof fs.getFileForOpening !== "function") return null;
      const file = await fs.getFileForOpening({
        types: ["wav", "mp3", "m4a", "aac", "json"]
      });
      if (!file) return null;
      const bytes = await file.read({ format: uxp.storage.formats.binary });
      return {
        fileName: file.name,
        mimeType: file.name.endsWith(".mp3") ? "audio/mpeg" : "audio/wav",
        audioBytes: bytes,
        isJson: /\.json$/i.test(file.name)
      };
    },
    async pickPresetFile() {
      const fs = uxp && uxp.storage && uxp.storage.localFileSystem;
      if (!fs || typeof fs.getFileForOpening !== "function") return null;
      const file = await fs.getFileForOpening({ types: ["epr"] });
      if (!file) return null;
      return file.nativePath || file.name;
    },
    async captureAudio(options) {
      if (!capture) {
        throw new Error("Audio capture is not available in this Premiere build.");
      }
      return capture.captureAudio(options);
    },
    async queryAdobeLanguages() {
      return adobe && typeof adobe.queryLanguages === "function" ? adobe.queryLanguages() : [];
    },
    async transcribeAdobe(options) {
      if (!adobe || typeof adobe.captureAdobe !== "function") {
        throw new Error(
          "Adobe Speech to Text is not available in this Premiere build. BirdCut needs Premiere 25.6+ Transcript APIs."
        );
      }
      return adobe.captureAdobe(options);
    },
    async saveTextFile(defaultName, contents, types) {
      const fs = uxp && uxp.storage && uxp.storage.localFileSystem;
      if (!fs || typeof fs.getFileForSaving !== "function") {
        return { ok: false, message: "UXP file picker is unavailable." };
      }
      const file = await fs.getFileForSaving(defaultName, { types: types || ["txt"] });
      if (!file) return { ok: false, message: "Save cancelled." };
      await file.write(contents);
      return { ok: true, message: `Saved ${file.name}` };
    },
    async setPlayerPosition(ms) {
      try {
        const { sequence } = await getProjectAndSequence();
        if (!ppro.TickTime || typeof sequence.setPlayerPosition !== "function") return false;
        await sequence.setPlayerPosition(ppro.TickTime.createWithSeconds((Number(ms) || 0) / 1000));
        return true;
      } catch (_err) {
        return false;
      }
    },
    ppro,
    uxp
  };
}

const api = { createPremiereHost, createUnavailableHost, tickToMs };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutHost = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
