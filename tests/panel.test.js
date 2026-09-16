"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createPanelController } = require("../src/ui/panel");
const fixture = require("../fixtures/sample-transcript.json");

function fakeRoot() {
  const doc = {
    addEventListener() {}
  };
  return {
    innerHTML: "",
    ownerDocument: doc,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

describe("panel controller", () => {
  it("mounts in preview, transcribes the mock fixture, and builds a cut plan after deletes", async () => {
    const messages = [];
    const host = {
      available: false,
      async getStatus() {
        return { available: false, message: "Preview host", sequenceName: "Demo" };
      },
      async getSequenceSnapshot() {
        return {
          items: [
            {
              id: "v1",
              startMs: 0,
              endMs: 92000,
              inPointMs: 0,
              outPointMs: 92000,
              trackIndex: 0,
              mediaType: "video"
            }
          ]
        };
      },
      async applyCutPlan(plan) {
        messages.push(plan.removeRanges.length);
        return { ok: true, applied: false, message: "preview apply" };
      },
      async setPlayerPosition() {
        return false;
      }
    };
    const memory = {};
    const storage = {
      getItem(key) {
        return memory[key] || null;
      },
      setItem(key, value) {
        memory[key] = String(value);
      },
      removeItem(key) {
        delete memory[key];
      }
    };
    const controller = createPanelController({
      root: fakeRoot(),
      host,
      storage,
      fixture
    });
    await controller.mount();
    await controller.transcribe();
    const after = controller.getState();
    assert.ok(after.transcript.words.length > 10);
    after.selectedIds = ["w2"];
    controller.deleteSelection();
    assert.equal(controller.getState().transcript.words.find((word) => word.id === "w2").deleted, true);
    controller.undo();
    assert.equal(controller.getState().transcript.words.find((word) => word.id === "w2").deleted, false);
    controller.redo();
    const srt = await controller.exportSrt();
    assert.match(srt, /-->/);
    await controller.applyToSequence();
    assert.ok(messages[0] >= 1);
  });

  it("Whisper mode captures sequence audio instead of the mock fixture", async () => {
    const captured = [];
    const origFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        duration: 0.3,
        words: [{ word: "Hello", start: 0, end: 0.3 }]
      })
    });
    try {
      const memory = {
        "birdcut.settings.v1": JSON.stringify({
          sttProvider: "whisper",
          whisperBaseUrl: "https://api.openai.com/v1"
        }),
        "birdcut.stt.apiKey": "sk-test"
      };
      const storage = {
        getItem(key) {
          return memory[key] || null;
        },
        setItem(key, value) {
          memory[key] = String(value);
        },
        removeItem(key) {
          delete memory[key];
        }
      };
      const host = {
        available: true,
        async getStatus() {
          return { available: true, message: "Seq", sequenceName: "Seq" };
        },
        async getSequenceSnapshot() {
          return { items: [] };
        },
        async captureAudio({ source, onProgress }) {
          captured.push(source);
          onProgress({ stage: "exporting", message: "Exporting sequence audio…" });
          return {
            audioBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
            fileName: "seq.wav",
            mimeType: "audio/wav",
            alignment: { kind: "sequence", offsetMs: 0, label: "Seq" }
          };
        }
      };
      const controller = createPanelController({
        root: fakeRoot(),
        host,
        storage,
        fixture
      });
      await controller.mount();
      await controller.transcribe("sequence");
      assert.deepEqual(captured, ["sequence"]);
      const spoken = controller.getState().transcript.words.filter((word) => !word.isSilence);
      assert.equal(spoken[0].text, "Hello");
      assert.match(controller.getState().message, /words from Seq/i);
    } finally {
      global.fetch = origFetch;
    }
  });
});
