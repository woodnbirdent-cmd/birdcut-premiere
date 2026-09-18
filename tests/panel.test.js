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
      async addCaptionsToSequence(payload) {
        messages.push(`captions:${payload.cueCount}:${payload.presetName}`);
        return { ok: true, applied: true, message: `Added ${payload.cueCount} cues` };
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

  it("adds captions with zero deleted ranges and does not use Apply cuts", async () => {
    const calls = [];
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
        available: false,
        async getStatus() {
          return { available: false, message: "Preview host", sequenceName: "Demo" };
        },
        async applyCutPlan() {
          calls.push("cuts");
          return { ok: false, message: "should not run" };
        },
        async addCaptionsToSequence(payload) {
          calls.push(payload);
          return { ok: true, applied: true, message: `Added ${payload.cueCount} cues (${payload.presetName})` };
        }
      },
      storage,
      fixture
    });
    await controller.mount();
    await controller.transcribe();
    const deleted = controller.getState().transcript.words.filter((word) => word.deleted);
    assert.equal(deleted.length, 0);
    await controller.applyToSequence();
    assert.equal(calls.includes("cuts"), false);
    assert.match(controller.getState().message, /Add captions to sequence/i);
    await controller.selectCaptionPreset("karaoke");
    assert.equal(controller.getState().settings.captionPresetId, "karaoke");
    const result = await controller.addCaptionsToSequence();
    assert.equal(result.ok, true);
    assert.equal(calls[0].presetName, "Karaoke");
    assert.ok(calls[0].cueCount > 0);
    assert.match(root.innerHTML, /Add captions to sequence/);
    assert.match(root.innerHTML, /Karaoke/);
    assert.match(root.innerHTML, /Style presets/);
    assert.match(root.innerHTML, /Animation feel/);
    assert.match(root.innerHTML, /1 word/);
    assert.match(root.innerHTML, /2 words/);
    assert.match(root.innerHTML, /ALL CAPS/);
    assert.match(root.innerHTML, /captionFontFamily/);
    assert.match(root.innerHTML, /data-color-swatch/);
    assert.match(root.innerHTML, /hex-field/);
    assert.doesNotMatch(root.innerHTML, /type="color"/);
    assert.match(root.innerHTML, /Apply cuts/);
    assert.doesNotMatch(root.innerHTML, /Caption style preset/);
    assert.doesNotMatch(controller.getState().message, /deleted ranges/i);
  });

  it("can emit 2-word cues from the Captions tab controls", async () => {
    const calls = [];
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
      host: {
        available: false,
        async getStatus() {
          return { available: false, message: "Preview host", sequenceName: "Demo" };
        },
        async addCaptionsToSequence(payload) {
          calls.push(payload);
          return { ok: true, applied: true, message: `Added ${payload.cueCount} cues` };
        }
      },
      storage,
      fixture
    });
    await controller.mount();
    await controller.transcribe();
    await controller.selectCaptionPreset("karaoke");
    const oneWord = await controller.addCaptionsToSequence();
    await controller.saveCaptionStyle({ captionWordsPerCue: "2", captionFontFamily: "Impact", captionColor: "#FFAA00" });
    const twoWord = await controller.addCaptionsToSequence();
    assert.equal(oneWord.ok, true);
    assert.equal(twoWord.ok, true);
    assert.ok(calls[0].cueCount > calls[1].cueCount);
    assert.ok(calls[1].cueCount > 0);
    assert.equal(controller.getState().settings.captionWordsPerCue, "2");
    assert.equal(controller.getState().settings.captionFontFamily, "Impact");
  });

  it("flushing Captions font fields does not reset words-per-cue", async () => {
    const values = {
      captionFontFamily: "Arial",
      captionColor: "#FFFFFF",
      captionOutlineColor: "#000000"
    };
    const form = {
      querySelector(sel) {
        const match = /\[name=["']?(\w+)["']?\]/.exec(sel);
        const name = match && match[1];
        if (!name || !(name in values)) return null;
        return {
          name,
          get value() {
            return values[name];
          },
          getAttribute: (key) => (key === "name" ? name : "")
        };
      },
      addEventListener() {}
    };
    const root = {
      innerHTML: "",
      ownerDocument: { addEventListener() {} },
      querySelector(sel) {
        if (sel === "#captions-form") return form;
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
    await controller.transcribe();
    await controller.saveCaptionStyle({ captionWordsPerCue: "2" });
    assert.equal(controller.getState().settings.captionWordsPerCue, "2");
  });

  it("persists ALL CAPS and hex color without a native color input", async () => {
    const calls = [];
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
      host: {
        available: false,
        async getStatus() {
          return { available: false, message: "Preview host", sequenceName: "Demo" };
        },
        async addCaptionsToSequence(payload) {
          calls.push(payload);
          return { ok: true, applied: true, message: `Added ${payload.cueCount} cues` };
        }
      },
      storage,
      fixture
    });
    await controller.mount();
    await controller.transcribe();
    await controller.selectCaptionPreset("karaoke");
    await controller.saveCaptionStyle({
      captionUppercase: true,
      captionFontFamily: "Impact",
      captionColor: "#FF3300",
      captionOutlineColor: "00FF00"
    });
    const result = await controller.addCaptionsToSequence();
    assert.equal(result.ok, true);
    assert.equal(controller.getState().settings.captionUppercase, true);
    assert.equal(controller.getState().settings.captionFontFamily, "Impact");
    assert.equal(controller.getState().settings.captionColor, "#FF3300");
    assert.match(calls[0].srt, /OKAY/);
    assert.match(calls[0].srt, /face="Impact"/);
    assert.match(calls[0].srt, /#FF3300/i);
    assert.match(calls[0].ttml, /OKAY/);
    assert.match(calls[0].ttml, /Impact/);
    assert.match(calls[0].ttml, /#FF3300/i);
    assert.equal(calls[0].uppercase, true);
    assert.match(calls[0].styleHint || "", /TTML|font/i);
    assert.equal(controller.getState().settings.captionOutlineColor, "#00FF00");
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
    assert.match(controller.getState().message, /Add captions to sequence/i);
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
          captionPresetId: { value: "clean-lower-third" },
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
      captionPresetId: "clean-lower-third",
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
        async transcribeAdobe({ onProgress }) {
          onProgress({ stage: "transcribing", message: "Transcribing in Premiere…" });
          onProgress({ stage: "exporting", message: "Exporting transcript…" });
          onProgress({ stage: "mapping", message: "Mapping words…" });
          stages.push("ran");
          return mapAdobeTranscript(adobe, { label: "Take 1" });
        }
      },
      storage,
      fixture
    });
    await controller.mount();
    await controller.saveSettings({ sttProvider: "adobe" });
    assert.match(root.innerHTML, /Transcribe sequence/);
    await controller.transcribe("clip");
    assert.deepEqual(stages, ["ran"]);
    const spoken = controller.getState().transcript.words.filter((word) => !word.isSilence);
    assert.equal(spoken[0].text, "Hello");
    assert.match(controller.getState().message, /Adobe Speech to Text/i);
  });
});
