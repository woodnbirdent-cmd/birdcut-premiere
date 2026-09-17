"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { explainSttError, isPremiereUnknownSttError, PREMIERE_UNKNOWN_STT_MESSAGE } = require("../src/stt/errors");

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

  it("maps Premiere unknown Speech to Text error -1609629681 / 0xa00f000f", () => {
    const expected = PREMIERE_UNKNOWN_STT_MESSAGE;
    assert.equal(explainSttError(new Error("Error: -1609629681")), expected);
    assert.equal(explainSttError(new Error("unknown error 1609629681")), expected);
    assert.equal(explainSttError(new Error("Premiere failed 0xa00f000f")), expected);
    assert.equal(explainSttError({ code: -1609629681, message: "unknown" }), expected);
    assert.equal(explainSttError({ errorCode: "0xA00F000F" }), expected);
    assert.equal(isPremiereUnknownSttError("a00f000f"), true);
    assert.equal(isPremiereUnknownSttError("some other error"), false);
    assert.match(expected, /Window → Text/);
    assert.match(expected, /Project panel/);
    assert.match(expected, /import/i);
  });

  it("explains a missing Local Whisper sidecar", () => {
    assert.match(
      explainSttError(new Error("Local Whisper sidecar is not running at http://127.0.0.1:8090. Start it in Terminal: cd sidecar/local-whisper && ./start.sh"), {
        provider: "local-whisper",
        baseUrl: "http://127.0.0.1:8090/v1"
      }),
      /sidecar\/local-whisper/i
    );
    assert.match(
      explainSttError(new Error("Failed to fetch"), {
        provider: "local-whisper",
        baseUrl: "http://127.0.0.1:8090/v1"
      }),
      /Start it in Terminal/i
    );
  });
});
