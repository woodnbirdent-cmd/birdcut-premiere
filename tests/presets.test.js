"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const presets = require("../src/premiere/presets");

describe("audio presets", () => {
  it("prefers MP3 system presets over WAV", () => {
    assert.ok(presets.scorePresetName("MP3 128kbps.epr") > presets.scorePresetName("Wave 48kHz.epr"));
    assert.equal(presets.scorePresetName("H.264 Match Source.epr"), -1);
  });

  it("allows small audio/video files to skip bounce", () => {
    assert.equal(presets.canSendFileDirectly("/clips/take1.wav", 4000), true);
    assert.equal(presets.canSendFileDirectly("/clips/take1.mp4", 8 * 1024 * 1024), true);
    assert.equal(presets.canSendFileDirectly("/clips/take1.mp4", 40 * 1024 * 1024), false);
    assert.equal(presets.canSendFileDirectly("/clips/take1.mxf", 4000), false);
  });

  it("includes Premiere 26 Mac systempreset roots", () => {
    const roots = presets.defaultPresetRoots({ homeDir: "/Users/demo" });
    assert.ok(roots.some((root) => root.indexOf("Premiere Pro 2026") >= 0 && root.indexOf("systempresets") >= 0));
    assert.ok(roots.some((root) => root.indexOf("/Volumes/WNB Apps/Applications") >= 0));
    assert.ok(roots.some((root) => root.indexOf("/Users/demo/Documents/Adobe/Adobe Media Encoder/26.0/Presets") >= 0));
  });
});
