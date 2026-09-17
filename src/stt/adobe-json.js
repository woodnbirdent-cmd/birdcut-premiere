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

function loadTime() {
  if (typeof require === "function") {
    try {
      return require("../core/time");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutTime || {};
}

const model = loadModel();
const time = loadTime();

function secondsToMs(value) {
  if (time && typeof time.secondsToMs === "function") return time.secondsToMs(value);
  return Math.round((Number(value) || 0) * 1000);
}

function parseAdobeJson(raw) {
  if (raw == null || raw === "") {
    throw new Error("Premiere returned an empty transcript. Open Window → Text and confirm the clip has a transcript.");
  }
  if (typeof raw === "object") return raw;
  const text = String(raw).trim();
  if (!text || text === "null") {
    throw new Error("Premiere returned an empty transcript. Open Window → Text and confirm the clip has a transcript.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_err) {
    throw new Error("Premiere transcript JSON could not be parsed. Expected Adobe exportToJSON format (language + segments + speakers).");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Premiere transcript JSON was not an object.");
  }
  return parsed;
}

function isFillerTags(tags) {
  return Array.isArray(tags) && tags.some((tag) => String(tag).toLowerCase() === "filler");
}

function chapterTitle(words) {
  const text = words
    .filter((word) => word.type !== "punctuation")
    .map((word) => word.text)
    .join(" ")
    .trim();
  if (!text) return "Segment";
  const parts = text.split(/\s+/).slice(0, 6);
  return parts.join(" ");
}

/**
 * Map Premiere `Transcript.exportToJSON` payload to the BirdCut model.
 * Shape is Adobe's published spec: sample-panels/premiere-api/assets/transcript_format_spec.json
 * Times are seconds from the start of the source clip audio.
 */
function mapAdobeTranscript(payload, { label } = {}) {
  const json = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : parseAdobeJson(payload);
  const speakersIn = Array.isArray(json.speakers) ? json.speakers : [];
  const speakerById = new Map();
  const speakers = speakersIn.map((speaker, index) => {
    const id = String(speaker.id || `s${index + 1}`);
    const mapped = { id, label: speaker.name || speaker.label || `Speaker ${index + 1}`, color: null };
    speakerById.set(id, mapped);
    return mapped;
  });

  const words = [];
  const chapters = [];
  const segments = Array.isArray(json.segments) ? json.segments : [];
  segments.forEach((segment, segmentIndex) => {
    const speakerId = segment.speaker ? String(segment.speaker) : null;
    if (speakerId && !speakerById.has(speakerId)) {
      const extra = { id: speakerId, label: `Speaker ${speakers.length + 1}`, color: null };
      speakers.push(extra);
      speakerById.set(speakerId, extra);
    }
    const segmentWords = Array.isArray(segment.words) ? segment.words : [];
    const mappedSegmentWords = [];
    segmentWords.forEach((word) => {
      const startMs = secondsToMs(word.start);
      const durationMs = secondsToMs(word.duration);
      const endMs = Math.max(startMs, startMs + durationMs);
      const text = String(word.text != null ? word.text : "").trim();
      if (!text) return;
      mappedSegmentWords.push({
        text,
        startMs,
        endMs,
        speakerId,
        confidence: word.confidence == null ? null : Number(word.confidence),
        isFiller: isFillerTags(word.tags),
        type: word.type || "word"
      });
    });
    mappedSegmentWords.forEach((word) => words.push(word));
    if (mappedSegmentWords.length) {
      const startMs = secondsToMs(segment.start != null ? segment.start : mappedSegmentWords[0].startMs / 1000);
      const endMs =
        segment.duration != null
          ? startMs + secondsToMs(segment.duration)
          : mappedSegmentWords[mappedSegmentWords.length - 1].endMs;
      chapters.push({
        title: chapterTitle(segmentWords),
        startMs,
        endMs,
        id: `seg${segmentIndex + 1}`
      });
    }
  });

  if (!words.length) {
    throw new Error(
      "Adobe transcript had no words. Confirm Speech to Text finished in Window → Text, then try Transcribe again."
    );
  }

  const language = String(json.language || "en")
    .split("-")[0]
    .toLowerCase();

  return model.normalizeTranscript({
    version: 1,
    source: { kind: "adobe", label: label || "Adobe Speech to Text" },
    language: language || "en",
    words,
    speakers,
    chapters
  });
}

function mergeAdobeTranscripts(parts, { label } = {}) {
  const list = (parts || []).filter(Boolean);
  if (!list.length) {
    throw new Error("No Adobe transcripts to merge.");
  }
  if (list.length === 1) {
    const only = model.cloneTranscript(list[0]);
    only.source = { kind: "adobe", label: label || only.source.label, origin: only.source.origin };
    return model.normalizeTranscript(only);
  }
  const words = [];
  const speakers = [];
  const seenSpeakers = new Set();
  const chapters = [];
  let language = "en";
  list.forEach((part, index) => {
    language = part.language || language;
    (part.words || []).forEach((word) => {
      words.push({ ...word, id: `p${index}_${word.id}` });
    });
    (part.speakers || []).forEach((speaker) => {
      if (seenSpeakers.has(speaker.id)) return;
      seenSpeakers.add(speaker.id);
      speakers.push(speaker);
    });
    (part.chapters || []).forEach((chapter) => {
      chapters.push({ ...chapter, id: `p${index}_${chapter.id}` });
    });
  });
  words.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return model.normalizeTranscript({
    version: 1,
    source: { kind: "adobe", label: label || "Adobe Speech to Text", origin: "sequence" },
    language,
    words,
    speakers,
    chapters
  });
}

const api = { parseAdobeJson, mapAdobeTranscript, mergeAdobeTranscripts };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutAdobeJson = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
