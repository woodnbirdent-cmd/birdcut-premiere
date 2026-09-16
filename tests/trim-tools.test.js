"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/core/transcript-model");
const trim = require("../src/core/trim-tools");
const fixture = require("../fixtures/sample-transcript.json");

describe("trim tools", () => {
  it("drafts silence removals from gaps", () => {
    const { transcript, draft } = trim.draftRemoveSilence(fixture, { minSilenceMs: 700 });
    assert.ok(transcript.words.some((word) => word.isSilence));
    assert.ok(draft.wordIdsToDelete.length > 0);
    assert.equal(draft.tool, "silence");
  });

  it("marks configured filler phrases", () => {
    const { draft } = trim.draftRemoveFillers(fixture, ["um", "uh", "you know", "i mean", "so", "actually"]);
    assert.ok(draft.wordIdsToDelete.includes("w2"));
    assert.ok(draft.wordIdsToDelete.includes("w62"));
    assert.ok(draft.wordIdsToDelete.includes("w63"));
    assert.ok(draft.wordIdsToDelete.includes("w78"));
  });

  it("catches retake cue phrases and repeated n-grams", () => {
    const { draft } = trim.draftRemoveRetakes(fixture);
    assert.ok(draft.wordIdsToDelete.includes("w14"));
    assert.ok(draft.wordIdsToDelete.includes("w19"));
    assert.ok(draft.wordIdsToDelete.includes("w20"));
    assert.equal(draft.tool, "retakes");
  });

  it("builds shortform windows from chapters and applies as keep-mask", () => {
    const { draft } = trim.draftShortformClips(fixture, { maxClips: 2, maxClipMs: 30000 });
    assert.equal(draft.clipWindows.length, 2);
    const next = trim.applyDraftToTranscript(model.normalizeTranscript(fixture), draft);
    const kept = next.words.filter((word) => !word.deleted && !word.isSilence);
    assert.ok(kept.every((word) => word.startMs < 60000));
  });
});
