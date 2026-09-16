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
});
