"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const captions = require("../src/core/captions-srt");
const model = require("../src/core/transcript-model");

describe("captions / SRT", () => {
  const transcript = model.normalizeTranscript({
    speakers: [
      { id: "s1", label: "Alex" },
      { id: "s2", label: "Jordan" }
    ],
    words: [
      { id: "w1", text: "Hello", startMs: 0, endMs: 400, speakerId: "s1" },
      { id: "w2", text: "there.", startMs: 450, endMs: 900, speakerId: "s1" },
      { id: "w3", text: "um", startMs: 1000, endMs: 1200, speakerId: "s1", deleted: true },
      { id: "w4", text: "Hi", startMs: 2000, endMs: 2300, speakerId: "s2" },
      { id: "w5", text: "Alex.", startMs: 2350, endMs: 2800, speakerId: "s2" },
      { id: "sil", text: "[silence]", startMs: 1200, endMs: 2000, isSilence: true }
    ]
  });

  it("formats SRT timestamps with comma millis", () => {
    const cues = captions.transcriptToCues(transcript);
    const srt = captions.cuesToSrt(cues);
    assert.match(srt, /00:00:00,000 --> /);
    assert.match(srt, /Alex: Hello there\./);
    assert.match(srt, /Jordan: Hi Alex\./);
    assert.doesNotMatch(srt, /\bum\b/);
    assert.doesNotMatch(srt, /silence/);
  });

  it("splits cues when the speaker changes", () => {
    const cues = captions.transcriptToCues(transcript);
    assert.equal(cues.length, 2);
    assert.equal(cues[0].speakerId, "s1");
    assert.equal(cues[1].speakerId, "s2");
  });

  it("omits speaker names when asked", () => {
    const srt = captions.transcriptToSrt(transcript, { includeSpeakers: false });
    assert.doesNotMatch(srt, /Alex:/);
    assert.match(srt, /Hello there\./);
  });
});
