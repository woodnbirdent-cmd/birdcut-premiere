"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const styles = require("../src/core/caption-styles");
const captions = require("../src/core/captions-srt");
const model = require("../src/core/transcript-model");
const settings = require("../src/core/settings");

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

describe("caption style presets", () => {
  it("exposes at least six named presets with font, color, and position", () => {
    const list = styles.listPresets();
    assert.ok(list.length >= 6);
    list.forEach((preset) => {
      assert.ok(preset.id);
      assert.ok(preset.name);
      assert.ok(preset.fontFamily);
      assert.ok(preset.fontSize > 0);
      assert.match(preset.color, /^#/);
      assert.ok(["top", "middle", "bottom"].includes(preset.verticalPosition));
      assert.ok(["left", "center", "right"].includes(preset.alignment));
      assert.ok(["phrase", "word"].includes(preset.cueMode));
    });
    assert.equal(styles.getPreset("missing").id, styles.DEFAULT_PRESET_ID);
    assert.equal(styles.getPreset("karaoke").wordsPerCue, "1");
    assert.equal(styles.getPreset("pop").wordsPerCue, "2");
  });

  it("keeps captionPresetId and word/font overrides in persisted settings", () => {
    const memory = {};
    const storage = {
      getItem(key) {
        return memory[key] || null;
      },
      setItem(key, value) {
        memory[key] = String(value);
      }
    };
    const store = settings.createSettingsStore(storage);
    return store
      .save({
        captionPresetId: "karaoke",
        captionWordsPerCue: "2",
        captionFontFamily: "Impact",
        captionColor: "#FFCC00"
      })
      .then((snap) => {
        assert.equal(snap.captionPresetId, "karaoke");
        assert.equal(snap.captionWordsPerCue, "2");
        assert.equal(snap.captionFontFamily, "Impact");
        assert.equal(JSON.parse(memory[settings.STORAGE_KEY]).captionColor, "#FFCC00");
      });
  });

  it("emits one cue per word for karaoke and styled SRT/TTML", () => {
    const payload = captions.buildCaptionExport(transcript, {
      includeSpeakers: false,
      presetId: "karaoke"
    });
    assert.equal(payload.cueCount, 4);
    assert.equal(payload.cues[0].text, "Hello");
    assert.match(payload.srt, /\\an2/);
    assert.match(payload.srt, /#FFE566/i);
    assert.match(payload.ttml, /Arial/);
    assert.match(payload.ttml, /#FFE566/i);
    assert.match(payload.ttml, /tts:origin/);
  });

  it("groups two words per cue from word timestamps", () => {
    const payload = captions.buildCaptionExport(transcript, {
      includeSpeakers: false,
      presetId: "pop",
      wordsPerCue: "2"
    });
    assert.equal(payload.cueCount, 2);
    assert.equal(payload.cues[0].text, "Hello there.");
    assert.equal(payload.cues[0].startMs, 0);
    assert.equal(payload.cues[0].endMs, 900);
    assert.equal(payload.cues[1].text, "Hi Alex.");
    assert.equal(payload.cues[1].startMs, 2000);
  });

  it("applies custom font and color overrides in SRT/TTML", () => {
    const payload = captions.buildCaptionExport(transcript, {
      includeSpeakers: false,
      presetId: "karaoke",
      wordsPerCue: "1",
      fontFamily: "Impact",
      color: "#FF3300",
      outlineColor: "#00FF00"
    });
    assert.equal(payload.cues[0].text, "Hello");
    assert.match(payload.srt, /#FF3300/i);
    assert.match(payload.ttml, /Impact/);
    assert.match(payload.ttml, /#FF3300/i);
    assert.match(payload.ttml, /#00FF00/i);
  });

  it("keeps phrase cues for subtitle box and includes a background in TTML", () => {
    const payload = captions.buildCaptionExport(transcript, {
      includeSpeakers: true,
      presetId: "subtitle-box"
    });
    assert.equal(payload.cueCount, 2);
    assert.match(payload.ttml, /backgroundColor/);
    assert.match(payload.srtPlain, /Alex: Hello there\./);
  });
});
