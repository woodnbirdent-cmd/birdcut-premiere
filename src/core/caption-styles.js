"use strict";
(function (root) {
const DEFAULT_PRESET_ID = "clean-lower-third";

/**
 * Named looks the Captions pane can apply.
 * Premiere UXP cannot drive After Effects–style motion on a caption track, so
 * animation fields describe what we *can* do: cue grouping, timing, color, and
 * position. Karaoke/pop/typewriter are timing approximations, not keyframed MOGRTs.
 */
const CAPTION_PRESETS = [
  {
    id: "clean-lower-third",
    name: "Clean Lower Third",
    description: "White Arial along the bottom third, thin outline.",
    fontFamily: "Arial",
    fontSize: 42,
    fontWeight: "600",
    color: "#FFFFFF",
    outlineColor: "#000000",
    outlineWidth: 2,
    shadow: true,
    alignment: "center",
    verticalPosition: "bottom",
    background: null,
    safeMarginPct: 8,
    cueMode: "phrase",
    animation: "none",
    animationNote: "Static styled captions.",
    previewAspect: "16:9",
    maxChars: 42,
    maxDurationMs: 5000,
    minDurationMs: 700
  },
  {
    id: "bold-center",
    name: "Bold Center",
    description: "Large centered title-style captions.",
    fontFamily: "Arial Black",
    fontSize: 64,
    fontWeight: "800",
    color: "#FFFFFF",
    outlineColor: "#000000",
    outlineWidth: 4,
    shadow: true,
    alignment: "center",
    verticalPosition: "middle",
    background: null,
    safeMarginPct: 10,
    cueMode: "phrase",
    animation: "none",
    animationNote: "Static styled captions.",
    previewAspect: "16:9",
    maxChars: 28,
    maxDurationMs: 3600,
    minDurationMs: 600
  },
  {
    id: "karaoke",
    name: "Karaoke",
    description: "Word-timed yellow captions (one word at a time).",
    fontFamily: "Arial",
    fontSize: 56,
    fontWeight: "700",
    color: "#FFE566",
    outlineColor: "#111111",
    outlineWidth: 3,
    shadow: true,
    alignment: "center",
    verticalPosition: "bottom",
    background: null,
    safeMarginPct: 10,
    cueMode: "word",
    animation: "karaoke",
    animationNote:
      "Premiere caption tracks cannot highlight a word inside a full line. BirdCut emits one cue per word as a karaoke approximation.",
    previewAspect: "16:9",
    maxChars: 24,
    maxDurationMs: 1200,
    minDurationMs: 180
  },
  {
    id: "pop",
    name: "Pop",
    description: "Short punchy phrases, large type.",
    fontFamily: "Arial Black",
    fontSize: 58,
    fontWeight: "800",
    color: "#FFFFFF",
    outlineColor: "#FF3B7A",
    outlineWidth: 3,
    shadow: true,
    alignment: "center",
    verticalPosition: "middle",
    background: null,
    safeMarginPct: 12,
    cueMode: "phrase",
    animation: "pop",
    animationNote:
      "Premiere cannot keyframe a pop/scale-in on caption tracks. Short, snappy cue timing approximates the look.",
    previewAspect: "16:9",
    maxChars: 22,
    maxDurationMs: 2200,
    minDurationMs: 360
  },
  {
    id: "subtitle-box",
    name: "Subtitle box",
    description: "White type on a semi-transparent bar.",
    fontFamily: "Arial",
    fontSize: 36,
    fontWeight: "500",
    color: "#FFFFFF",
    outlineColor: "#000000",
    outlineWidth: 1,
    shadow: false,
    alignment: "center",
    verticalPosition: "bottom",
    background: { color: "#000000", opacity: 0.65, paddingPx: 10 },
    safeMarginPct: 8,
    cueMode: "phrase",
    animation: "none",
    animationNote: "Static captions with a background box in TTML; SRT may drop the box.",
    previewAspect: "16:9",
    maxChars: 42,
    maxDurationMs: 5000,
    minDurationMs: 700
  },
  {
    id: "social-vertical",
    name: "Social vertical-safe",
    description: "Larger type, extra bottom margin for 9:16.",
    fontFamily: "Arial",
    fontSize: 68,
    fontWeight: "800",
    color: "#FFFFFF",
    outlineColor: "#111111",
    outlineWidth: 4,
    shadow: true,
    alignment: "center",
    verticalPosition: "bottom",
    background: null,
    safeMarginPct: 16,
    cueMode: "phrase",
    animation: "none",
    animationNote: "Static styled captions with larger type and safer bottom margin.",
    previewAspect: "9:16",
    maxChars: 24,
    maxDurationMs: 3200,
    minDurationMs: 500
  }
];

function listPresets() {
  return CAPTION_PRESETS.slice();
}

function getPreset(id) {
  const match = CAPTION_PRESETS.find((preset) => preset.id === id);
  return match || CAPTION_PRESETS[0];
}

function isKnownPresetId(id) {
  return CAPTION_PRESETS.some((preset) => preset.id === id);
}

function srtAlignTag(preset) {
  const vertical = preset && preset.verticalPosition;
  const alignment = preset && preset.alignment;
  const row = vertical === "top" ? 8 : vertical === "middle" ? 5 : 2;
  const col = alignment === "left" ? -1 : alignment === "right" ? 1 : 0;
  return `{\\an${row + col}}`;
}

function ttmlFontSize(preset) {
  const px = Number(preset && preset.fontSize) || 42;
  const pct = Math.max(4, Math.min(18, Math.round((px / 1080) * 1000) / 10));
  return `${pct}%`;
}

function ttmlRegion(preset) {
  const margin = Math.max(4, Number(preset && preset.safeMarginPct) || 8);
  const width = Math.max(40, 100 - margin * 2);
  const height = preset && preset.verticalPosition === "middle" ? 24 : 18;
  let originY;
  let displayAlign;
  if (preset && preset.verticalPosition === "top") {
    originY = margin;
    displayAlign = "before";
  } else if (preset && preset.verticalPosition === "middle") {
    originY = Math.round(50 - height / 2);
    displayAlign = "center";
  } else {
    originY = Math.max(margin, 100 - margin - height);
    displayAlign = "after";
  }
  const textAlign = (preset && preset.alignment) || "center";
  return {
    origin: `${margin}% ${originY}%`,
    extent: `${width}% ${height}%`,
    displayAlign,
    textAlign
  };
}

const api = {
  DEFAULT_PRESET_ID,
  CAPTION_PRESETS,
  listPresets,
  getPreset,
  isKnownPresetId,
  srtAlignTag,
  ttmlFontSize,
  ttmlRegion
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutCaptionStyles = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
