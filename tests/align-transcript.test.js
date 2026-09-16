"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const align = require("../src/stt/align-transcript");
const { mapWhisperResponse } = require("../src/stt/whisper-http");

function whisperWords() {
  return mapWhisperResponse({
    duration: 2,
    words: [
      { word: "Hello", start: 0.0, end: 0.4 },
      { word: "there", start: 0.5, end: 0.9 },
      { word: "later", start: 5.0, end: 5.4 }
    ]
  });
}

describe("bounce timing alignment", () => {
  it("shifts sequence-bounce Whisper times by the export offset", () => {
    const aligned = align.applyAlignment(whisperWords(), {
      kind: "sequence",
      offsetMs: 1500,
      label: "A-roll"
    });
    assert.equal(aligned.words[0].startMs, 1500);
    assert.equal(aligned.words[1].endMs, 2400);
    assert.equal(aligned.source.origin, "sequence");
    assert.equal(aligned.source.label, "A-roll");
  });

  it("maps media-file word times onto the clip’s sequence in/out", () => {
    const aligned = align.alignMediaWordsToSequence(whisperWords(), {
      clipStartMs: 10000,
      mediaInPointMs: 500,
      mediaOutPointMs: 1200,
      label: "Interview"
    });
    assert.equal(aligned.words.length, 1);
    assert.equal(aligned.words[0].text, "there");
    assert.equal(aligned.words[0].startMs, 10000);
    assert.equal(aligned.words[0].endMs, 10400);
    assert.equal(aligned.source.origin, "clip");
  });
});
