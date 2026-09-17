"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { mapWhisperResponse } = require("../src/stt/whisper-http");
const { transcribeAudio } = require("../src/stt/transcribe");
const fixture = require("../fixtures/sample-transcript.json");

describe("whisper mapping", () => {
  it("maps verbose_json word timings into the BirdCut transcript model", () => {
    const transcript = mapWhisperResponse({
      language: "en",
      duration: 2.5,
      words: [
        { word: "Hello", start: 0.0, end: 0.4, speaker: "A" },
        { word: "world", start: 0.45, end: 0.9, speaker: "A" }
      ],
      segments: [{ start: 0, end: 2.5, title: "Intro", speaker: "A" }]
    });
    assert.equal(transcript.words[0].text, "Hello");
    assert.equal(transcript.words[0].startMs, 0);
    assert.equal(transcript.words[1].endMs, 900);
    assert.equal(transcript.speakers[0].id, "A");
    assert.equal(transcript.chapters[0].title, "Intro");
    assert.equal(transcript.source.kind, "whisper");
  });

  it("falls back to segment text when word timings are missing", () => {
    const transcript = mapWhisperResponse({
      duration: 1,
      segments: [{ start: 0, end: 1, text: "Two tokens", speaker_id: "s1" }]
    });
    assert.equal(transcript.words.length, 2);
    assert.equal(transcript.words[0].speakerId, "s1");
  });
});

describe("stt router", () => {
  it("loads the mock fixture without calling the network", async () => {
    const transcript = await transcribeAudio({}, { sttProvider: "mock", silenceThresholdMs: 700, fillerList: ["um"] }, { fixture });
    assert.ok(transcript.words.some((word) => word.id === "w53"));
    assert.ok(transcript.words.some((word) => word.isSilence));
  });

  it("refuses Whisper without audio bytes", async () => {
    await assert.rejects(
      () => transcribeAudio({}, { sttProvider: "whisper" }, { apiKey: "sk-test" }),
      /sequence|clip|WAV/i
    );
  });

  it("refuses Local Whisper without audio bytes", async () => {
    await assert.rejects(
      () => transcribeAudio({}, { sttProvider: "local-whisper", localWhisperBaseUrl: "http://127.0.0.1:8090/v1" }, {}),
      /Local Whisper needs audio/i
    );
  });

  it("maps sequence-bounce Whisper timings using alignment offset", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        duration: 0.5,
        words: [{ word: "Hi", start: 0, end: 0.4 }]
      })
    });
    const transcript = await transcribeAudio(
      {
        audioBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        fileName: "bounce.wav",
        mimeType: "audio/wav",
        alignment: { kind: "sequence", offsetMs: 3500, label: "Main" }
      },
      { sttProvider: "whisper", silenceThresholdMs: 700, fillerList: [] },
      { apiKey: "sk-test", fetchImpl }
    );
    const spoken = transcript.words.filter((word) => !word.isSilence);
    assert.equal(spoken[0].text, "Hi");
    assert.equal(spoken[0].startMs, 3500);
    assert.equal(transcript.source.origin, "sequence");
  });
});
