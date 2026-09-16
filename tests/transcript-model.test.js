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
  it("keeps API keys out of the public snapshot", async () => {
    const memory = {};
    const storage = {
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
    const store = settings.createSettingsStore(storage);
    await store.save({ sttProvider: "whisper", apiKey: "sk-test-secret" });
    const snap = store.get();
    assert.equal(snap.sttProvider, "whisper");
    assert.equal(snap.hasApiKey, true);
    assert.equal(Object.prototype.hasOwnProperty.call(snap, "apiKey"), false);
    assert.equal(store.getApiKey(), "sk-test-secret");
    assert.equal(JSON.parse(memory[settings.STORAGE_KEY]).sttProvider, "whisper");
  });
});
