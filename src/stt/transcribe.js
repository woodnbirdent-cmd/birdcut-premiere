"use strict";
(function (root) {
function loadMock() {
  if (typeof require === "function") {
    try {
      return require("./mock-provider");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutMockStt || {};
}

function loadWhisper() {
  if (typeof require === "function") {
    try {
      return require("./whisper-http");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutWhisper || {};
}

function loadModel() {
  if (typeof require === "function") {
    try {
      return require("../core/transcript-model");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutTranscript || {};
}

function loadAlign() {
  if (typeof require === "function") {
    try {
      return require("./align-transcript");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutAlign || {};
}

function loadAdobeJson() {
  if (typeof require === "function") {
    try {
      return require("./adobe-json");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutAdobeJson || {};
}

const mock = loadMock();
const whisper = loadWhisper();
const model = loadModel();
const align = loadAlign();
const adobeJson = loadAdobeJson();

function emit(onProgress, stage, message) {
  if (typeof onProgress === "function") onProgress({ stage, message });
}

async function transcribeAudio(input, settings, deps) {
  const onProgress = deps && deps.onProgress;
  const provider = settings && settings.sttProvider;
  if (provider === "mock" || !provider) {
    emit(onProgress, "mapping", "Loading demo transcript…");
    const mockProvider = mock.createMockProvider(deps && deps.fixture);
    return mockProvider.transcribe(input, settings);
  }

  if (provider === "adobe") {
    let result = null;
    if (input && input.adobeJson) {
      emit(onProgress, "mapping", "Mapping words…");
      result = adobeJson.mapAdobeTranscript(input.adobeJson, { label: input.label });
      if (align.applyAlignment && input.alignment) {
        result = align.applyAlignment(result, input.alignment);
      }
    } else if (input && Array.isArray(input.adobeClips) && input.adobeClips.length) {
      emit(onProgress, "mapping", "Mapping words onto the sequence…");
      const parts = input.adobeClips.map((clip) => {
        let mapped = adobeJson.mapAdobeTranscript(clip.json || clip.adobeJson, { label: clip.label });
        if (align.applyAlignment && clip.alignment) mapped = align.applyAlignment(mapped, clip.alignment);
        return mapped;
      });
      result = adobeJson.mergeAdobeTranscripts(parts, { label: input.label });
    } else if (deps && typeof deps.captureAdobe === "function") {
      result = await deps.captureAdobe({
        source: (input && input.source) || settings.transcribeSource || "sequence",
        language: settings.language,
        importOnly: (input && input.source) === "import",
        onProgress
      });
    } else {
      throw new Error(
        "Adobe Speech to Text needs Premiere Pro 25.6+ (Transcript.transcribeClipProjectItem). Load BirdCut inside Premiere."
      );
    }
    emit(onProgress, "mapping", "Mapping words…");
    return model.annotateFillers(
      model.insertSilenceMarkers(result, { minGapMs: settings.silenceThresholdMs }),
      settings.fillerList
    );
  }

  if (provider !== "whisper") {
    throw new Error(`Unknown STT provider: ${provider}`);
  }

  if (!input || !input.audioBytes) {
    throw new Error("Whisper provider needs audio from the sequence, a selected clip, or a picked WAV/MP3/M4A.");
  }

  emit(onProgress, "uploading", "Uploading audio to Whisper…");
  let result = await whisper.transcribeWithWhisper({
    audioBytes: input.audioBytes,
    fileName: input.fileName,
    mimeType: input.mimeType,
    apiKey: deps && deps.apiKey,
    baseUrl: settings.whisperBaseUrl,
    modelName: settings.whisperModel,
    language: settings.language,
    fetchImpl: deps && deps.fetchImpl
  });

  emit(onProgress, "mapping", "Mapping word timings onto the sequence…");
  if (align.applyAlignment && input.alignment) {
    result = align.applyAlignment(result, input.alignment);
  }

  return model.annotateFillers(
    model.insertSilenceMarkers(result, { minGapMs: settings.silenceThresholdMs }),
    settings.fillerList
  );
}

const api = { transcribeAudio };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutStt = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
