"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/core/transcript-model");
const undo = require("../src/core/undo-stack");
const settings = require("../src/core/settings");
const fixture = require("../fixtures/sample-transcript.json");

describe("transcript model", () => {
  it("normalizes the sample fixture", () => {
    const transcript = model.normalizeTranscript(fixture);
    assert.equal(transcript.speakers.length, 2);
    assert.ok(transcript.words.length > 50);
    assert.equal(transcript.durationMs, 92000);
    const valid = model.validateTranscript(transcript);
    assert.equal(valid.ok, true);
  });

  it("annotates multi-word fillers and supports search + delete", () => {
    let transcript = model.annotateFillers(fixture, ["you know", "um"]);
    const youKnow = transcript.words.filter((word) => word.id === "w62" || word.id === "w63");
    assert.ok(youKnow.every((word) => word.isFiller));
    const hits = model.searchWordIds(transcript, "timeline");
    assert.deepEqual(hits, ["w49"]);
    transcript = model.setWordsDeleted(transcript, hits, true);
    assert.equal(transcript.words.find((word) => word.id === "w49").deleted, true);
    assert.match(model.wordsToPlainText(transcript), /BirdCut turns the transcript/);
    assert.doesNotMatch(model.wordsToPlainText(transcript), /timeline/);
  });

  it("undoes text edits", () => {
    const stack = undo.createUndoStack();
    const base = model.normalizeTranscript(fixture);
    stack.reset(base);
    stack.push(model.setWordsDeleted(base, ["w1"], true));
    assert.equal(stack.get().words.find((word) => word.id === "w1").deleted, true);
    stack.undo();
    assert.equal(stack.get().words.find((word) => word.id === "w1").deleted, false);
    stack.redo();
    assert.equal(stack.get().words.find((word) => word.id === "w1").deleted, true);
  });
});

describe("settings", () => {
  function memoryStorage(seed) {
    const memory = Object.assign({}, seed);
    return {
      _data: memory,
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
      },
      setItem(key, value) {
        memory[key] = String(value);
      },
      removeItem(key) {
        delete memory[key];
      }
    };
  }

  function memoryFileStore(seed) {
    let payload = seed ? JSON.parse(JSON.stringify(seed)) : null;
    return {
      async read() {
        return payload ? JSON.parse(JSON.stringify(payload)) : null;
      },
      async write(value) {
        payload = JSON.parse(JSON.stringify(value));
      },
      snapshot() {
        return payload;
      }
    };
  }

  it("keeps API keys out of the public snapshot", async () => {
    const storage = memoryStorage();
    const store = settings.createSettingsStore(storage);
    await store.save({ sttProvider: "whisper", apiKey: "sk-test-secret" });
    const snap = store.get();
    assert.equal(snap.sttProvider, "whisper");
    assert.equal(snap.hasApiKey, true);
    assert.equal(Object.prototype.hasOwnProperty.call(snap, "apiKey"), false);
    assert.equal(store.getApiKey(), "sk-test-secret");
    assert.equal(JSON.parse(storage._data[settings.STORAGE_KEY]).sttProvider, "whisper");
    assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(storage._data[settings.STORAGE_KEY]), "apiKey"), false);
  });

  it("normalizes whisper vs unknown providers", () => {
    assert.equal(settings.normalizeSettings({ sttProvider: "whisper" }).sttProvider, "whisper");
    assert.equal(settings.normalizeSettings({ sttProvider: "adobe" }).sttProvider, "adobe");
    assert.equal(settings.normalizeSettings({ sttProvider: "local-whisper" }).sttProvider, "local-whisper");
    assert.equal(
      settings.normalizeSettings({ sttProvider: "local-whisper" }).localWhisperBaseUrl,
      "http://127.0.0.1:8090/v1"
    );
    assert.equal(settings.normalizeSettings({ sttProvider: "demo" }).sttProvider, "mock");
    assert.equal(settings.normalizeSettings({}).sttProvider, "mock");
  });

  it("partial save keeps the current STT provider", async () => {
    const store = settings.createSettingsStore(memoryStorage());
    await store.save({ sttProvider: "whisper", whisperModel: "whisper-1" });
    await store.save({ audioPresetPath: "/tmp/audio.epr" });
    assert.equal(store.get().sttProvider, "whisper");
    assert.equal(store.get().audioPresetPath, "/tmp/audio.epr");
  });

  it("reloads Whisper from the plugin data folder when localStorage is empty", async () => {
    const fileStore = memoryFileStore();
    const store = settings.createSettingsStore(memoryStorage(), null, fileStore);
    await store.save({ sttProvider: "whisper", language: "es" });
    const reloaded = settings.createSettingsStore(memoryStorage(), null, fileStore);
    await reloaded.load();
    assert.equal(reloaded.get().sttProvider, "whisper");
    assert.equal(reloaded.get().language, "es");
  });

  it("migrates localStorage settings into the plugin data folder", async () => {
    const storage = memoryStorage({
      [settings.STORAGE_KEY]: JSON.stringify({ sttProvider: "whisper" })
    });
    const fileStore = memoryFileStore();
    const store = settings.createSettingsStore(storage, null, fileStore);
    await store.load();
    assert.equal(store.get().sttProvider, "whisper");
    assert.equal(fileStore.snapshot().sttProvider, "whisper");
  });

  it("createPluginFileStore round-trips JSON in the data folder", async () => {
    const files = {};
    const folder = {
      async getEntry(name) {
        if (!Object.prototype.hasOwnProperty.call(files, name)) throw new Error("missing");
        return {
          async read() {
            return files[name];
          },
          async write(value) {
            files[name] = value;
          }
        };
      },
      async createFile(name) {
        files[name] = files[name] || "";
        return {
          async read() {
            return files[name];
          },
          async write(value) {
            files[name] = value;
          }
        };
      }
    };
    const fileStore = settings.createPluginFileStore({
      localFileSystem: {
        async getDataFolder() {
          return folder;
        }
      }
    });
    await fileStore.write({ sttProvider: "whisper" });
    const loaded = await fileStore.read();
    assert.equal(loaded.sttProvider, "whisper");
    assert.ok(files[settings.SETTINGS_FILE]);
  });
});
