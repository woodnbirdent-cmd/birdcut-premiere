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

const time = loadTime();

const DEFAULT_OPTIONS = {
  maxChars: 42,
  maxLines: 2,
  maxDurationMs: 5000,
  minDurationMs: 700,
  includeSpeakers: true
};

function captionWords(transcript) {
  return (transcript.words || []).filter((word) => !word.deleted && !word.isSilence && word.text);
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

function transcriptToCues(transcript, options) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const words = captionWords(transcript);
  const cues = [];
  let current = null;

  const flush = () => {
    if (!current || !current.words.length) return;
    const body = current.words.map((word) => word.text).join(" ");
    const speaker = (transcript.speakers || []).find((item) => item.id === current.speakerId);
    const prefix = opts.includeSpeakers && speaker ? `${speaker.label}: ` : "";
    const text = wrapCueText(prefix + body, opts.maxChars, opts.maxLines);
    const endMs = Math.max(current.endMs, current.startMs + opts.minDurationMs);
    cues.push({
      startMs: current.startMs,
      endMs,
      text,
      speakerId: current.speakerId || null
    });
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

function cuesToSrt(cues) {
  return (cues || [])
    .map((cue, index) => {
      const start = time.formatSrtTime(cue.startMs);
      const end = time.formatSrtTime(cue.endMs);
      return `${index + 1}\n${start} --> ${end}\n${cue.text}\n`;
    })
    .join("\n")
    .trim();
}

function transcriptToSrt(transcript, options) {
  return cuesToSrt(transcriptToCues(transcript, options));
}

const api = {
  DEFAULT_OPTIONS,
  captionWords,
  transcriptToCues,
  cuesToSrt,
  transcriptToSrt
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutCaptions = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
