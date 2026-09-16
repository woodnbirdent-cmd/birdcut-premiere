"use strict";
(function (root) {
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

const model = loadModel();

function defaultFixture() {
  if (typeof require === "function") {
    try {
      return require("../../fixtures/sample-transcript-data.js");
    } catch (_err) {
      /* UXP may not load .json via require; JS module is the portable copy */
    }
    try {
      return require("../../fixtures/sample-transcript.json");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutSampleTranscript || null;
}

async function loadFixtureFromPluginFolder() {
  try {
    const uxp = require("uxp");
    const folder = await uxp.storage.localFileSystem.getPluginFolder();
    const file = await folder.getEntry("fixtures/sample-transcript.json");
    const formats = uxp.storage.formats || {};
    const text = await file.read(formats.utf8 ? { format: formats.utf8 } : undefined);
    return JSON.parse(String(text));
  } catch (_err) {
    return null;
  }
}

function createMockProvider(fixture) {
  return {
    id: "mock",
    label: "Mock / demo transcript",
    async transcribe(_input, options) {
      const data = fixture || defaultFixture() || (await loadFixtureFromPluginFolder());
      if (!data) {
        throw new Error("Mock transcript fixture is not available.");
      }
      const transcript = model.normalizeTranscript(data);
      const threshold = options && options.silenceThresholdMs ? options.silenceThresholdMs : 700;
      return model.annotateFillers(
        model.insertSilenceMarkers(transcript, { minGapMs: threshold }),
        options && options.fillerList
      );
    }
  };
}

const api = { createMockProvider, defaultFixture, loadFixtureFromPluginFolder };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutMockStt = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
