"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const adobeJson = require("../src/stt/adobe-json");
const adobeLang = require("../src/stt/adobe-language");
const { transcribeAudio } = require("../src/stt/transcribe");
const fixture = require("../fixtures/adobe-transcript.json");

describe("Adobe exportToJSON mapper", () => {
  it("maps the published Premiere transcript spec into BirdCut words", () => {
    const transcript = adobeJson.mapAdobeTranscript(fixture, { label: "Take 1" });
    assert.equal(transcript.source.kind, "adobe");
    assert.equal(transcript.source.label, "Take 1");
    assert.equal(transcript.language, "en");
    assert.equal(transcript.words[0].text, "Hello");
    assert.equal(transcript.words[0].startMs, 1740);
    assert.equal(transcript.words[0].endMs, 2370);
    assert.equal(transcript.words[0].speakerId, "631fbbc0-9c02-47c4-bb8c-732c020fa24f");
    assert.equal(transcript.words[1].text, "world");
    assert.equal(transcript.words[2].text, ".");
    assert.equal(transcript.words[3].text, "um");
    assert.equal(transcript.words[3].isFiller, true);
    assert.equal(transcript.speakers[0].label, "Jane Doe");
    assert.ok(transcript.chapters.length >= 1);
    assert.match(transcript.chapters[0].title, /Hello/);
  });

  it("parses exportToJSON strings and rejects empty payloads", () => {
    const fromString = adobeJson.mapAdobeTranscript(JSON.stringify(fixture));
    assert.equal(fromString.words[0].text, "Hello");
    assert.throws(() => adobeJson.parseAdobeJson(""), /empty transcript/i);
    assert.throws(() => adobeJson.parseAdobeJson("not-json"), /could not be parsed/i);
  });

  it("merges per-clip Adobe transcripts by timeline position", () => {
    const a = adobeJson.mapAdobeTranscript(fixture, { label: "A" });
    const shifted = JSON.parse(JSON.stringify(a));
    shifted.words.forEach((word) => {
      word.startMs += 10000;
      word.endMs += 10000;
    });
    shifted.chapters.forEach((chapter) => {
      chapter.startMs += 10000;
      chapter.endMs += 10000;
    });
    const merged = adobeJson.mergeAdobeTranscripts([a, shifted], { label: "Seq" });
    assert.equal(merged.source.kind, "adobe");
    assert.equal(merged.source.origin, "sequence");
    assert.equal(merged.words[0].startMs, 1740);
    assert.ok(merged.words.some((word) => word.startMs === 11740 && word.text === "Hello"));
  });
});

describe("Adobe language mapping", () => {
  const supported = [
    { displayString: "English (US)", languageCode: "en-US", locale: "en-us" },
    { displayString: "English (UK)", languageCode: "en-GB", locale: "en-gb" },
    { displayString: "Spanish", languageCode: "es-ES", locale: "es-es" }
  ];

  it("maps Settings language onto Premiere languageCode values", () => {
    assert.equal(adobeLang.resolveAdobeLanguage("en", supported), "en-US");
    assert.equal(adobeLang.resolveAdobeLanguage("en-GB", supported), "en-GB");
    assert.equal(adobeLang.resolveAdobeLanguage("es", supported), "es-ES");
  });

  it("returns a default en-US mapping when Premiere cannot list packs", () => {
    assert.equal(adobeLang.resolveAdobeLanguage("en", []), "en-US");
    assert.equal(adobeLang.resolveAdobeLanguage("zz", supported), "");
  });

  it("omits language when the pack is unavailable or the supported list is empty", () => {
    const ok = adobeLang.languageForTranscribe("en", supported, () => true);
    assert.equal(ok.languageCode, "en-US");
    assert.equal(ok.reason, "ok");

    const missing = adobeLang.languageForTranscribe("en", supported, () => false);
    assert.equal(missing.languageCode, "");
    assert.equal(missing.skippedCode, "en-US");
    assert.equal(missing.reason, "pack-unavailable");

    const unverified = adobeLang.languageForTranscribe("en", [], () => true);
    assert.equal(unverified.languageCode, "");
    assert.equal(unverified.reason, "unverified");

    const failed = adobeLang.languageForTranscribe("en", supported, () => {
      throw new Error("host");
    });
    assert.equal(failed.languageCode, "");
    assert.equal(failed.reason, "pack-check-failed");
  });
});

describe("Adobe STT router", () => {
  it("maps adobeJson without calling Whisper or requiring an API key", async () => {
    const transcript = await transcribeAudio(
      { adobeJson: fixture, label: "Clip A", alignment: { kind: "media", clipStartMs: 5000, mediaInPointMs: 0, mediaOutPointMs: 20000, label: "Clip A" } },
      { sttProvider: "adobe", silenceThresholdMs: 700, fillerList: ["um"] },
      {}
    );
    const hello = transcript.words.find((word) => word.text === "Hello");
    assert.equal(hello.startMs, 6740);
    assert.equal(transcript.source.kind, "adobe");
    assert.equal(transcript.source.origin, "clip");
  });

  it("merges adobeClips onto sequence time", async () => {
    const transcript = await transcribeAudio(
      {
        label: "Timeline",
        adobeClips: [
          {
            json: fixture,
            label: "A",
            alignment: { kind: "media", clipStartMs: 0, mediaInPointMs: 0, mediaOutPointMs: 20000, label: "A" }
          },
          {
            json: fixture,
            label: "B",
            alignment: { kind: "media", clipStartMs: 20000, mediaInPointMs: 0, mediaOutPointMs: 20000, label: "B" }
          }
        ]
      },
      { sttProvider: "adobe", silenceThresholdMs: 90000, fillerList: [] },
      {}
    );
    const hellos = transcript.words.filter((word) => word.text === "Hello");
    assert.equal(hellos.length, 2);
    assert.equal(hellos[0].startMs, 1740);
    assert.equal(hellos[1].startMs, 21740);
  });

  it("passes importOnly when the source is import", async () => {
    const calls = [];
    await transcribeAudio(
      { source: "import" },
      { sttProvider: "adobe", language: "en", silenceThresholdMs: 700, fillerList: [] },
      {
        async captureAdobe(opts) {
          calls.push(opts);
          return {
            version: 1,
            source: { kind: "adobe", label: "Clip" },
            language: "en",
            durationMs: 100,
            words: [{ id: "w1", text: "Hi", startMs: 0, endMs: 100, deleted: false }],
            speakers: [],
            chapters: []
          };
        }
      }
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].source, "import");
    assert.equal(calls[0].importOnly, true);
  });
});
