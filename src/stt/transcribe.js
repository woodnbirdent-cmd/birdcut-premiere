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

const mock = loadMock();
const whisper = loadWhisper();
const model = loadModel();
const align = loadAlign();

function emit(onProgress, stage, message) {
  if (typeof onProgress === "function") onProgress({ stage, message });
}

async function transcribeAudio(input, settings, deps) {
  const onProgress = deps && deps.onProgress;
  const provider = settings.sttProvider === "whisper" ? "whisper" : "mock";
  if (provider === "mock") {
    emit(onProgress, "mapping", "Loading demo transcript…");
    const mockProvider = mock.createMockProvider(deps && deps.fixture);
    return mockProvider.transcribe(input, settings);
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
