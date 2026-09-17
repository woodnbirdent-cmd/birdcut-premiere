"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createPanelController, readSettingsFromForm } = require("../src/ui/panel");
const settings = require("../src/core/settings");
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

  it("readSettingsFromForm captures Whisper without a submit", () => {
    const form = {
      querySelector(sel) {
        const match = /\[name=["']?(\w+)["']?\]/.exec(sel);
        const name = match && match[1];
        const values = {
          language: { value: "en" },
          sttProvider: { value: "whisper" },
          whisperBaseUrl: { value: "https://api.openai.com/v1" },
          whisperModel: { value: "whisper-1" },
          fillerList: { value: "um" },
          textSize: { value: "md" },
          silenceThresholdMs: { value: "700" },
          padCutMs: { value: "40" },
          includeSpeakerInCaptions: { checked: true, value: "on" },
          transcribeSource: { value: "sequence" },
          audioPresetPath: { value: "" },
          apiKey: { value: "" }
        };
        return values[name] || null;
      }
    };
    const data = readSettingsFromForm(form);
    assert.equal(data.sttProvider, "whisper");
    assert.equal(Object.prototype.hasOwnProperty.call(data, "apiKey"), false);
  });

  it("Whisper sticks across a later preset-only save and a storage reload", async () => {
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
    const host = {
      available: false,
      async getStatus() {
        return { available: false, message: "Preview host", sequenceName: "Demo" };
      }
    };
    const root = fakeRoot();
    const controller = createPanelController({
      root,
      host,
      storage,
      fixture
    });
    await controller.mount();
    await controller.saveSettings({ sttProvider: "whisper" });
    assert.equal(controller.getState().settings.sttProvider, "whisper");
    await controller.saveSettings({ audioPresetPath: "/tmp/audio.epr" });
    assert.equal(controller.getState().settings.sttProvider, "whisper");
    assert.equal(controller.getState().settings.audioPresetPath, "/tmp/audio.epr");
    const reloaded = settings.createSettingsStore(storage);
    await reloaded.load();
    assert.equal(reloaded.get().sttProvider, "whisper");
    assert.match(root.innerHTML, /class="pane"/);
    assert.match(root.innerHTML, /Transcribe sequence/);
  });

  it("flushing a live settings form keeps Whisper through persist + render", async () => {
    const values = {
      language: "en",
      sttProvider: "mock",
      whisperBaseUrl: "https://api.openai.com/v1",
      whisperModel: "whisper-1",
      fillerList: "um",
      textSize: "md",
      silenceThresholdMs: "700",
      padCutMs: "40",
      includeSpeakerInCaptions: true,
      transcribeSource: "sequence",
      audioPresetPath: "",
      apiKey: ""
    };
    const form = {
      listeners: {},
      querySelector(sel) {
        const match = /\[name=["']?(\w+)["']?\]/.exec(sel);
        const name = match && match[1];
        if (!name || !(name in values)) return null;
        if (name === "includeSpeakerInCaptions") {
          return {
            name,
            get checked() {
              return Boolean(values[name]);
            },
            get value() {
              return values[name];
            },
            getAttribute: (key) => (key === "name" ? name : "")
          };
        }
        return {
          name,
          get value() {
            return values[name];
          },
          set value(next) {
            values[name] = next;
          },
          getAttribute: (key) => (key === "name" ? name : ""),
          addEventListener(type, fn) {
            form.listeners[`${name}:${type}`] = form.listeners[`${name}:${type}`] || [];
            form.listeners[`${name}:${type}`].push(fn);
          }
        };
      },
      addEventListener(type, fn) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(fn);
      }
    };
    const root = {
      innerHTML: "",
      ownerDocument: { addEventListener() {} },
      querySelector(sel) {
        if (sel === "#settings-form") return form;
        return null;
      },
      querySelectorAll() {
        return [];
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
      root,
      host: {
        available: false,
        async getStatus() {
          return { available: false, message: "Preview host", sequenceName: "Demo" };
        }
      },
      storage,
      fixture
    });
    await controller.mount();
    values.sttProvider = "whisper";
    const changeTarget = form.querySelector('[name="sttProvider"]');
    const changeEvent = { target: changeTarget };
    (form.listeners.change || []).forEach((fn) => fn(changeEvent));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controller.getState().settings.sttProvider, "whisper");
    assert.match(root.innerHTML, /Transcribe sequence/);
    values.audioPresetPath = "/tmp/mix.epr";
    await controller.saveSettings({ audioPresetPath: "/tmp/mix.epr" });
    assert.equal(controller.getState().settings.sttProvider, "whisper");
    assert.equal(JSON.parse(memory[settings.STORAGE_KEY]).sttProvider, "whisper");
  });

  it("Adobe native transcribes without an OpenAI key", async () => {
    const adobe = require("../fixtures/adobe-transcript.json");
    const { mapAdobeTranscript } = require("../src/stt/adobe-json");
    const stages = [];
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
    const root = fakeRoot();
    const controller = createPanelController({
      root,
      host: {
        available: true,
        async getStatus() {
          return { available: true, message: "Seq", sequenceName: "Seq" };
        },
        async getSequenceSnapshot() {
          return { items: [] };
        },
        async queryAdobeLanguages() {
          return [{ displayString: "English (US)", languageCode: "en-US", locale: "en-us", packAvailable: true }];
        },
        async transcribeAdobe({ onProgress, source, importOnly }) {
          onProgress({ stage: "transcribing", message: "Transcribing in Premiere…" });
          onProgress({ stage: "exporting", message: "Exporting transcript…" });
          onProgress({ stage: "mapping", message: "Mapping words…" });
          stages.push({ source, importOnly: Boolean(importOnly) });
          return mapAdobeTranscript(adobe, { label: "Take 1" });
        }
      },
      storage,
      fixture
    });
    await controller.mount();
    await controller.saveSettings({ sttProvider: "adobe" });
    assert.match(root.innerHTML, /Transcribe sequence/);
    assert.match(root.innerHTML, /Import Premiere transcript/);
    await controller.transcribe("clip");
    assert.deepEqual(stages, [{ source: "clip", importOnly: false }]);
    const spoken = controller.getState().transcript.words.filter((word) => !word.isSilence);
    assert.equal(spoken[0].text, "Hello");
    assert.match(controller.getState().message, /Adobe Speech to Text/i);
    await controller.transcribe("import");
    assert.deepEqual(stages[1], { source: "import", importOnly: true });
    assert.match(controller.getState().message, /Imported .*Premiere transcript/i);
  });
});
