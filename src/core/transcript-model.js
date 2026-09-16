"use strict";
(function (root) {
function loadDep() {
  if (typeof require === "function") {
    try {
      return require("./time");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutTime || {};
}

const time = loadDep();

let idCounter = 0;

function nextId(prefix) {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

function resetIdCounter(value) {
  idCounter = Number(value) || 0;
}

function createEmptyTranscript(overrides) {
  return normalizeTranscript({
    version: 1,
    source: { kind: "empty", label: "Empty" },
    language: "en",
    durationMs: 0,
    words: [],
    speakers: [],
    chapters: [],
    ...overrides
  });
}

function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeWord(raw, index) {
  const startMs = Math.max(0, asNumber(raw.startMs != null ? raw.startMs : raw.start, 0));
  const endMs = Math.max(startMs, asNumber(raw.endMs != null ? raw.endMs : raw.end, startMs));
  const text = String(raw.text != null ? raw.text : raw.word || "").trim();
  return {
    id: raw.id || `w${index + 1}`,
    text,
    startMs,
    endMs,
    speakerId: raw.speakerId || raw.speaker || null,
    deleted: Boolean(raw.deleted),
    isSilence: Boolean(raw.isSilence || raw.silence),
    isFiller: Boolean(raw.isFiller),
    confidence: raw.confidence == null ? null : asNumber(raw.confidence, null)
  };
}

function normalizeSpeaker(raw, index) {
  return {
    id: raw.id || `s${index + 1}`,
    label: raw.label || raw.name || `Speaker ${index + 1}`,
    color: raw.color || null
  };
}

function normalizeChapter(raw, index) {
  return {
    id: raw.id || `c${index + 1}`,
    title: raw.title || `Chapter ${index + 1}`,
    startMs: Math.max(0, asNumber(raw.startMs, 0)),
    endMs: Math.max(0, asNumber(raw.endMs, 0))
  };
}

function durationFromWords(words) {
  return words.reduce((max, word) => Math.max(max, word.endMs || 0), 0);
}

function normalizeTranscript(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const words = Array.isArray(input.words)
    ? input.words.map((word, index) => normalizeWord(word, index))
    : [];
  const speakers = Array.isArray(input.speakers)
    ? input.speakers.map((speaker, index) => normalizeSpeaker(speaker, index))
    : [];
  const chapters = Array.isArray(input.chapters)
    ? input.chapters.map((chapter, index) => normalizeChapter(chapter, index))
    : [];
  const durationMs = Math.max(asNumber(input.durationMs, 0), durationFromWords(words));

  const speakerIds = new Set(speakers.map((speaker) => speaker.id));
  words.forEach((word) => {
    if (word.speakerId && !speakerIds.has(word.speakerId)) {
      speakers.push(normalizeSpeaker({ id: word.speakerId, label: word.speakerId }, speakers.length));
      speakerIds.add(word.speakerId);
    }
  });

  return {
    version: input.version || 1,
    source: input.source || { kind: "unknown", label: "Unknown" },
    language: input.language || "en",
    durationMs,
    words,
    speakers,
    chapters
  };
}

function cloneTranscript(transcript) {
  return JSON.parse(JSON.stringify(normalizeTranscript(transcript)));
}

function insertSilenceMarkers(transcript, { minGapMs = 700 } = {}) {
  const next = cloneTranscript(transcript);
  const words = [];
  let lastEnd = 0;
  let silenceIndex = 0;
  next.words.forEach((word) => {
    if (!word.isSilence && word.startMs - lastEnd >= minGapMs) {
      silenceIndex += 1;
      words.push({
        id: `sil-${silenceIndex}-${word.id}`,
        text: "[silence]",
        startMs: lastEnd,
        endMs: word.startMs,
        speakerId: null,
        deleted: false,
        isSilence: true,
        isFiller: false,
        confidence: null
      });
    }
    words.push(word);
    lastEnd = Math.max(lastEnd, word.endMs);
  });
  if (next.durationMs - lastEnd >= minGapMs) {
    silenceIndex += 1;
    words.push({
      id: `sil-end-${silenceIndex}`,
      text: "[silence]",
      startMs: lastEnd,
      endMs: next.durationMs,
      speakerId: null,
      deleted: false,
      isSilence: true,
      isFiller: false,
      confidence: null
    });
  }
  next.words = words;
  return next;
}

function normalizeFillerToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fillerPatterns(fillerList) {
  return (fillerList || [])
    .map(normalizeFillerToken)
    .filter(Boolean)
    .sort((a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length);
}

function annotateFillers(transcript, fillerList) {
  const next = cloneTranscript(transcript);
  const patterns = fillerPatterns(fillerList);
  const spoken = next.words.filter((word) => !word.isSilence);
  const tokens = spoken.map((word) => normalizeFillerToken(word.text));
  spoken.forEach((word) => {
    word.isFiller = false;
  });
  for (let i = 0; i < tokens.length; i += 1) {
    for (const pattern of patterns) {
      const parts = pattern.split(" ");
      const slice = tokens.slice(i, i + parts.length);
      if (slice.length === parts.length && slice.join(" ") === pattern) {
        for (let j = 0; j < parts.length; j += 1) {
          spoken[i + j].isFiller = true;
        }
        break;
      }
    }
  }
  return next;
}

function setWordsDeleted(transcript, wordIds, deleted) {
  const idSet = new Set(wordIds);
  const next = cloneTranscript(transcript);
  next.words.forEach((word) => {
    if (idSet.has(word.id)) word.deleted = Boolean(deleted);
  });
  return next;
}

function toggleWordsDeleted(transcript, wordIds) {
  const idSet = new Set(wordIds);
  const next = cloneTranscript(transcript);
  next.words.forEach((word) => {
    if (idSet.has(word.id)) word.deleted = !word.deleted;
  });
  return next;
}

function restoreAllWords(transcript) {
  const next = cloneTranscript(transcript);
  next.words.forEach((word) => {
    word.deleted = false;
  });
  return next;
}

function activeWords(transcript) {
  return (transcript.words || []).filter((word) => !word.deleted);
}

function searchWordIds(transcript, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];
  return (transcript.words || [])
    .filter((word) => !word.isSilence && word.text.toLowerCase().includes(needle))
    .map((word) => word.id);
}

function wordsToPlainText(wordsOrTranscript) {
  const words = Array.isArray(wordsOrTranscript)
    ? wordsOrTranscript
    : (wordsOrTranscript && wordsOrTranscript.words) || [];
  return words
    .filter((word) => !word.deleted && !word.isSilence)
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function speakerLabel(transcript, speakerId) {
  const speaker = (transcript.speakers || []).find((item) => item.id === speakerId);
  return speaker ? speaker.label : speakerId || "";
}

function validateTranscript(transcript) {
  const normalized = normalizeTranscript(transcript);
  const errors = [];
  if (!Array.isArray(normalized.words)) errors.push("words must be an array");
  normalized.words.forEach((word, index) => {
    if (!word.text && !word.isSilence) errors.push(`word[${index}] missing text`);
    if (word.endMs < word.startMs) errors.push(`word[${index}] endMs < startMs`);
  });
  return { ok: errors.length === 0, errors, transcript: normalized };
}

const api = {
  nextId,
  resetIdCounter,
  createEmptyTranscript,
  normalizeTranscript,
  cloneTranscript,
  insertSilenceMarkers,
  annotateFillers,
  setWordsDeleted,
  toggleWordsDeleted,
  restoreAllWords,
  activeWords,
  searchWordIds,
  wordsToPlainText,
  speakerLabel,
  validateTranscript,
  normalizeFillerToken,
  fillerPatterns,
  durationFromWords
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutTranscript = api;
}

void time;

})(typeof globalThis !== "undefined" ? globalThis : this);
