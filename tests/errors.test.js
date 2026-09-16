"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { explainSttError } = require("../src/stt/errors");

describe("STT error copy", () => {
  it("tells the user where to paste a missing API key", () => {
    assert.match(
      explainSttError(new Error("Missing STT API key. Set it in Settings.")),
      /Whisper/i
    );
  });

  it("explains Premiere network blocks and empty audio", () => {
    assert.match(
      explainSttError(new Error("Permission denied to the url"), { baseUrl: "http://127.0.0.1:9000/v1" }),
      /manifest.json/
    );
    assert.match(explainSttError(new Error("Empty audio: 0 bytes")), /audible audio/);
  });
});
