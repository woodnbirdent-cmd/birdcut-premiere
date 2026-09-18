"use strict";
(function (root) {
function loadTime() {
  if (typeof require === "function") {
    try {
      return require("./time");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutTime || {};
}

function loadStyles() {
  if (typeof require === "function") {
    try {
      return require("./caption-styles");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutCaptionStyles || {};
}

const time = loadTime();

function stylesApi() {
  return loadStyles();
}

const DEFAULT_OPTIONS = {
  maxChars: 42,
  maxLines: 2,
  maxDurationMs: 5000,
  minDurationMs: 700,
  includeSpeakers: true,
  cueMode: "phrase",
  preset: null
};

function captionWords(transcript) {
  return (transcript.words || []).filter((word) => !word.deleted && !word.isSilence && word.text);
}

function resolveOptions(options) {
  const raw = options || {};
  const preset =
    raw.preset && typeof raw.preset === "object"
      ? raw.preset
      : stylesApi().getPreset
        ? stylesApi().getPreset(raw.presetId || raw.captionPresetId)
        : null;
  const cueMode = raw.cueMode || (preset && preset.cueMode) || DEFAULT_OPTIONS.cueMode;
  return {
    ...DEFAULT_OPTIONS,
    ...raw,
    preset,
    cueMode,
    maxChars: raw.maxChars != null ? raw.maxChars : (preset && preset.maxChars) || DEFAULT_OPTIONS.maxChars,
    maxDurationMs:
      raw.maxDurationMs != null
        ? raw.maxDurationMs
        : (preset && preset.maxDurationMs) || DEFAULT_OPTIONS.maxDurationMs,
    minDurationMs:
      raw.minDurationMs != null
        ? raw.minDurationMs
        : (preset && preset.minDurationMs) || DEFAULT_OPTIONS.minDurationMs
  };
}

function shouldStartNewCue(current, word, options) {
  if (!current.words.length) return false;
  const nextText = current.words.concat(word).map((item) => item.text).join(" ");
  const duration = word.endMs - current.startMs;
  if (word.speakerId && current.speakerId && word.speakerId !== current.speakerId) return true;
  if (duration > options.maxDurationMs) return true;
  if (nextText.length > options.maxChars * options.maxLines) return true;
  return false;
}

function wrapCueText(text, maxChars, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.join("\n");
  return lines.slice(0, maxLines).join("\n");
}

function makeCue(transcript, current, opts) {
  const body = current.words.map((word) => word.text).join(" ");
  const speaker = (transcript.speakers || []).find((item) => item.id === current.speakerId);
  const includeSpeakers = opts.includeSpeakers && opts.cueMode !== "word";
  const prefix = includeSpeakers && speaker ? `${speaker.label}: ` : "";
  const text = wrapCueText(prefix + body, opts.maxChars, opts.maxLines);
  const endMs = Math.max(current.endMs, current.startMs + opts.minDurationMs);
  return {
    startMs: current.startMs,
    endMs,
    text,
    speakerId: current.speakerId || null,
    words: current.words.slice()
  };
}

function transcriptToCues(transcript, options) {
  const opts = resolveOptions(options);
  const words = captionWords(transcript);
  if (opts.cueMode === "word") {
    return words.map((word) => ({
      startMs: word.startMs,
      endMs: Math.max(word.endMs, word.startMs + opts.minDurationMs),
      text: word.text,
      speakerId: word.speakerId || null,
      words: [word]
    }));
  }

  const cues = [];
  let current = null;

  const flush = () => {
    if (!current || !current.words.length) return;
    cues.push(makeCue(transcript, current, opts));
    current = null;
  };

  words.forEach((word) => {
    if (!current) {
      current = {
        startMs: word.startMs,
        endMs: word.endMs,
        speakerId: word.speakerId || null,
        words: [word]
      };
      return;
    }
    if (shouldStartNewCue(current, word, opts)) {
      flush();
      current = {
        startMs: word.startMs,
        endMs: word.endMs,
        speakerId: word.speakerId || null,
        words: [word]
      };
      return;
    }
    current.words.push(word);
    current.endMs = word.endMs;
  });
  flush();
  return cues;
}

function escapeXml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function styleSrtText(text, preset) {
  if (!preset) return text;
  const align = stylesApi().srtAlignTag ? stylesApi().srtAlignTag(preset) : "";
  const color = String(preset.color || "#FFFFFF").replace("#", "");
  const lines = String(text).split("\n").map((line) => `<font color="#${color}">${line}</font>`);
  return `${align}${lines.join("\n")}`;
}

function formatTtmlTime(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  const pad2 = time.pad2 || ((n) => String(Math.floor(n)).padStart(2, "0"));
  const pad3 = time.pad3 || ((n) => String(Math.floor(n)).padStart(3, "0"));
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
}

function shouldStyleSrt(options, opts) {
  if (opts.styleSrt === false) return false;
  if (opts.styleSrt === true) return true;
  return Boolean(options && (options.preset || options.presetId || options.captionPresetId));
}

function cuesToSrt(cues, options) {
  const opts = resolveOptions(options);
  const styled = shouldStyleSrt(options, opts);
  const preset = styled ? opts.preset : null;
  return (cues || [])
    .map((cue, index) => {
      const start = time.formatSrtTime(cue.startMs);
      const end = time.formatSrtTime(cue.endMs);
      const body = preset ? styleSrtText(cue.text, preset) : cue.text;
      return `${index + 1}\n${start} --> ${end}\n${body}\n`;
    })
    .join("\n")
    .trim();
}

function cuesToTtml(cues, options) {
  const opts = resolveOptions(options);
  const preset = opts.preset || (stylesApi().getPreset ? stylesApi().getPreset() : {});
  const region = stylesApi().ttmlRegion ? stylesApi().ttmlRegion(preset) : {
    origin: "10% 80%",
    extent: "80% 15%",
    displayAlign: "after",
    textAlign: "center"
  };
  const fontSize = stylesApi().ttmlFontSize ? stylesApi().ttmlFontSize(preset) : "8%";
  const bg = preset && preset.background;
  const bgColor = bg
    ? `rgba(${parseInt((bg.color || "#000000").slice(1, 3), 16)},${parseInt(
        (bg.color || "#000000").slice(3, 5),
        16
      )},${parseInt((bg.color || "#000000").slice(5, 7), 16)},${bg.opacity == null ? 0.65 : bg.opacity})`
    : "transparent";
  const outline = preset && preset.outlineWidth
    ? ` tts:textOutline="${preset.outlineColor || "#000000"} ${preset.outlineWidth}px"`
    : "";
  const paragraphs = (cues || [])
    .map(
      (cue) =>
        `    <p begin="${formatTtmlTime(cue.startMs)}" end="${formatTtmlTime(cue.endMs)}" region="caption" style="s1">${escapeXml(
          cue.text
        ).replace(/\n/g, "<br/>")}</p>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xml:lang="en" xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling">
  <head>
    <styling>
      <style xml:id="s1" tts:fontFamily="${escapeXml(preset.fontFamily || "Arial")}" tts:fontSize="${fontSize}" tts:fontWeight="${escapeXml(
        preset.fontWeight || "600"
      )}" tts:color="${escapeXml(preset.color || "#FFFFFF")}" tts:textAlign="${escapeXml(
        region.textAlign
      )}" tts:backgroundColor="${escapeXml(bgColor)}"${outline}/>
    </styling>
    <layout>
      <region xml:id="caption" tts:origin="${region.origin}" tts:extent="${region.extent}" tts:displayAlign="${region.displayAlign}" tts:textAlign="${region.textAlign}"/>
    </layout>
  </head>
  <body>
    <div>
${paragraphs}
    </div>
  </body>
</tt>
`;
}

function transcriptToSrt(transcript, options) {
  const opts = resolveOptions(options);
  return cuesToSrt(transcriptToCues(transcript, opts), opts);
}

function transcriptToTtml(transcript, options) {
  const opts = resolveOptions(options);
  return cuesToTtml(transcriptToCues(transcript, opts), opts);
}

function buildCaptionExport(transcript, options) {
  const opts = resolveOptions(options);
  const cues = transcriptToCues(transcript, opts);
  const preset = opts.preset || (stylesApi().getPreset ? stylesApi().getPreset() : { id: "clean-lower-third", name: "Clean Lower Third" });
  return {
    cues,
    preset,
    srt: cuesToSrt(cues, { ...opts, styleSrt: true }),
    srtPlain: cuesToSrt(cues, { ...opts, styleSrt: false, preset: null }),
    ttml: cuesToTtml(cues, opts),
    wordCount: captionWords(transcript).length,
    cueCount: cues.length
  };
}

const api = {
  DEFAULT_OPTIONS,
  captionWords,
  resolveOptions,
  transcriptToCues,
  cuesToSrt,
  cuesToTtml,
  transcriptToSrt,
  transcriptToTtml,
  buildCaptionExport,
  styleSrtText,
  formatTtmlTime
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutCaptions = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
