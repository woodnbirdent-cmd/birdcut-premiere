"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { transcribeOne } = require("../src/premiere/adobe-stt");
const fixture = require("../fixtures/adobe-transcript.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Adobe Premiere Transcript host wrapper", () => {
  it("reuses an existing transcript via exportToJSON", async () => {
    const item = { name: "A-roll", has: true };
    const T = {
      hasTranscript(clip) {
        return Boolean(clip.has);
      },
      async transcribeClipProjectItem() {
        throw new Error("should not transcribe when a transcript already exists");
      },
      async exportToJSON() {
        return JSON.stringify(fixture);
      }
    };
    const json = await transcribeOne(T, item, { name: "A-roll", timeoutMs: 2000 });
    assert.equal(json.language, "en-us");
    assert.equal(json.segments[0].words[0].text, "Hello");
  });

  it("waits for transcribeClipProjectItem then exports JSON", async () => {
    const item = { name: "B-roll", has: false };
    const T = {
      hasTranscript(clip) {
        return Boolean(clip.has);
      },
      async transcribeClipProjectItem(clip, options) {
        assert.equal(options.language, "en-US");
        await sleep(10);
        clip.has = true;
        return true;
      },
      async exportToJSON(clip) {
        if (!clip.has) throw new Error("not ready");
        return JSON.stringify(fixture);
      }
    };
    const json = await transcribeOne(T, item, { languageCode: "en-US", name: "B-roll", timeoutMs: 2000 });
    assert.ok(item.has);
    assert.equal(json.speakers[0].name, "Jane Doe");
  });
});
