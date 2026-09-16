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

const mock = loadMock();
const whisper = loadWhisper();
const model = loadModel();

async function transcribeAudio(input, settings, deps) {
  const provider = settings.sttProvider === "whisper" ? "whisper" : "mock";
  if (provider === "mock") {
    const mockProvider = mock.createMockProvider(deps && deps.fixture);
    return mockProvider.transcribe(input, settings);
  }

  if (!input || !input.audioBytes) {
    throw new Error("Whisper provider needs an audio file. Use Transcribe and pick a WAV/MP3/M4A.");
  }

  const result = await whisper.transcribeWithWhisper({
    audioBytes: input.audioBytes,
    fileName: input.fileName,
    mimeType: input.mimeType,
    apiKey: deps && deps.apiKey,
    baseUrl: settings.whisperBaseUrl,
    modelName: settings.whisperModel,
    language: settings.language,
    fetchImpl: deps && deps.fetchImpl
  });

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
