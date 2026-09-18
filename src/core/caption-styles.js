"use strict";
(function (root) {
const DEFAULT_PRESET_ID = "clean-lower-third";

const SYSTEM_FONTS = [
  "Arial",
  "Arial Black",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Verdana",
  "Trebuchet MS",
  "Palatino",
  "Comic Sans MS"
];

const WORDS_PER_CUE_VALUES = ["1", "2", "phrase"];

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
    wordsPerCue: "phrase",
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
    wordsPerCue: "phrase",
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
    wordsPerCue: "1",
    animation: "karaoke",
    animationNote:
      "Premiere caption tracks cannot highlight a word inside a full line or keyframe a pop. BirdCut emits 1–2 word cues from Whisper timestamps; the panel preview can scale, the timeline cannot.",
    previewAspect: "16:9",
    maxChars: 24,
    maxDurationMs: 900,
    minDurationMs: 100
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
    cueMode: "word",
    wordsPerCue: "2",
    animation: "pop",
    animationNote:
      "Premiere cannot keyframe a pop/scale-in on caption tracks. Two-word cues with snappy word timestamps approximate the look. Panel preview pops; the timeline does not.",
    previewAspect: "16:9",
    maxChars: 22,
    maxDurationMs: 1400,
    minDurationMs: 140
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
    wordsPerCue: "phrase",
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
    wordsPerCue: "phrase",
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

function listFonts(extra) {
  const fonts = SYSTEM_FONTS.slice();
  const add = String(extra || "").trim();
  if (add && fonts.indexOf(add) < 0) fonts.unshift(add);
  return fonts;
}

function normalizeWordsPerCue(value, fallback) {
  const raw = String(value == null ? "" : value).trim().toLowerCase();
  if (raw === "1" || raw === "2" || raw === "phrase") return raw;
  if (raw === "word") return "1";
  return fallback || "phrase";
}

function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.slice(1).toUpperCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
  }
  return fallback || "#FFFFFF";
}

function mergeStyle(presetOrId, overrides) {
  const base = typeof presetOrId === "object" && presetOrId ? { ...getPreset(presetOrId.id), ...presetOrId } : getPreset(presetOrId);
  const o = overrides && typeof overrides === "object" ? overrides : {};
  const wordsPerCue = normalizeWordsPerCue(
    o.wordsPerCue != null && o.wordsPerCue !== "" ? o.wordsPerCue : base.wordsPerCue,
    base.wordsPerCue || "phrase"
  );
  return {
    ...base,
    fontFamily: String(o.fontFamily || base.fontFamily || "Arial"),
    color: o.color ? normalizeHexColor(o.color, base.color) : base.color,
    outlineColor: o.outlineColor ? normalizeHexColor(o.outlineColor, base.outlineColor) : base.outlineColor,
    wordsPerCue,
    cueMode: wordsPerCue === "phrase" ? "phrase" : "word"
  };
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
  SYSTEM_FONTS,
  WORDS_PER_CUE_VALUES,
  listPresets,
  getPreset,
  isKnownPresetId,
  listFonts,
  normalizeWordsPerCue,
  normalizeHexColor,
  mergeStyle,
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
