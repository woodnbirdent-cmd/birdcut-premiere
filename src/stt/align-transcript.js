"use strict";
(function (root) {
function loadModel() {
  if (typeof require === "function") {
    try {
      return require("../core/transcript-model");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutTranscript || {};
}

const model = loadModel();

function shiftTimes(transcript, offsetMs) {
  const next = model.cloneTranscript(transcript);
  const shift = Number(offsetMs) || 0;
  next.words.forEach((word) => {
    word.startMs += shift;
    word.endMs += shift;
  });
  next.chapters.forEach((chapter) => {
    chapter.startMs += shift;
    chapter.endMs += shift;
  });
  next.durationMs = Math.max(0, (next.durationMs || 0) + shift);
  return next;
}

/**
 * Map Whisper timings from a source media file onto sequence time.
 * media time T → sequence = clipStartMs + (T - mediaInPointMs)
 */
function alignMediaWordsToSequence(transcript, alignment) {
  const clipStartMs = Number(alignment.clipStartMs) || 0;
  const mediaInPointMs = Number(alignment.mediaInPointMs) || 0;
  const mediaOutPointMs =
    alignment.mediaOutPointMs == null ? Number.POSITIVE_INFINITY : Number(alignment.mediaOutPointMs);
  const next = model.cloneTranscript(transcript);
  next.words = next.words
    .filter((word) => word.endMs > mediaInPointMs && word.startMs < mediaOutPointMs)
    .map((word) => {
      const startMs = clipStartMs + (Math.max(word.startMs, mediaInPointMs) - mediaInPointMs);
      const endMs = clipStartMs + (Math.min(word.endMs, mediaOutPointMs) - mediaInPointMs);
      return { ...word, startMs, endMs };
    });
  next.chapters = (next.chapters || []).map((chapter) => ({
    ...chapter,
    startMs: clipStartMs + (Math.max(chapter.startMs, mediaInPointMs) - mediaInPointMs),
    endMs: clipStartMs + (Math.min(chapter.endMs, mediaOutPointMs) - mediaInPointMs)
  }));
  next.durationMs = next.words.reduce((max, word) => Math.max(max, word.endMs), clipStartMs);
  next.source = {
    ...(next.source || {}),
    kind: (next.source && next.source.kind) || "whisper",
    label: alignment.label || next.source.label,
    origin: "clip"
  };
  return model.normalizeTranscript(next);
}

function applyAlignment(transcript, alignment) {
  if (!alignment || !alignment.kind || alignment.kind === "sequence") {
    const shifted = shiftTimes(transcript, alignment && alignment.offsetMs);
    shifted.source = {
      ...(shifted.source || {}),
      kind: (shifted.source && shifted.source.kind) || "whisper",
      label: (alignment && alignment.label) || shifted.source.label,
      origin: "sequence"
    };
    return shifted;
  }
  if (alignment.kind === "media" || alignment.kind === "clip") {
    return alignMediaWordsToSequence(transcript, alignment);
  }
  return transcript;
}

const api = { shiftTimes, alignMediaWordsToSequence, applyAlignment };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutAlign = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
