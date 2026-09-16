"use strict";

function loadModel() {
  if (typeof require === "function") {
    try {
      return require("./transcript-model");
    } catch (_err) {
      /* fall through */
    }
  }
  return globalThis.BirdCutTranscript || {};
}

const model = loadModel();

const RETAKE_PHRASES = [
  "let me start over",
  "start over",
  "from the top",
  "i'll say that again",
  "ill say that again",
  "let me rephrase",
  "wait wait",
  "no no no",
  "sorry sorry",
  "scratch that",
  "take two"
];

function draftId(tool) {
  return `${tool}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function summarizeWordIds(transcript, wordIds) {
  const idSet = new Set(wordIds);
  const words = (transcript.words || []).filter((word) => idSet.has(word.id));
  const removedMs = words.reduce((sum, word) => sum + Math.max(0, word.endMs - word.startMs), 0);
  return {
    removedCount: words.length,
    removedMs,
    labels: words.slice(0, 8).map((word) => word.text)
  };
}

function createDraft(tool, transcript, wordIds, extra) {
  const uniqueIds = Array.from(new Set(wordIds));
  return {
    id: draftId(tool),
    tool,
    createdAt: new Date().toISOString(),
    wordIdsToDelete: uniqueIds,
    clipWindows: extra && extra.clipWindows ? extra.clipWindows : [],
    summary: summarizeWordIds(transcript, uniqueIds),
    note: extra && extra.note ? extra.note : ""
  };
}

function applyDraftToTranscript(transcript, draft) {
  if (!draft) return model.cloneTranscript(transcript);
  if (draft.tool === "shortform" && draft.clipWindows && draft.clipWindows.length) {
    const next = model.cloneTranscript(transcript);
    next.words.forEach((word) => {
      const keep = draft.clipWindows.some(
        (window) => word.startMs < window.endMs && word.endMs > window.startMs
      );
      word.deleted = !keep;
    });
    return next;
  }
  return model.setWordsDeleted(transcript, draft.wordIdsToDelete, true);
}

function draftRemoveSilence(transcript, { minSilenceMs = 700 } = {}) {
  const withMarkers = model.insertSilenceMarkers(transcript, { minGapMs: minSilenceMs });
  const wordIds = withMarkers.words
    .filter((word) => word.isSilence && word.endMs - word.startMs >= minSilenceMs)
    .map((word) => word.id);
  const draft = createDraft("silence", withMarkers, wordIds, {
    note: `Remove silences ≥ ${minSilenceMs}ms`
  });
  return { transcript: withMarkers, draft };
}

function draftRemoveFillers(transcript, fillerList) {
  const annotated = model.annotateFillers(transcript, fillerList);
  const wordIds = annotated.words.filter((word) => word.isFiller && !word.deleted).map((word) => word.id);
  const draft = createDraft("fillers", annotated, wordIds, {
    note: `Remove fillers: ${(fillerList || []).join(", ")}`
  });
  return { transcript: annotated, draft };
}

function tokenAt(words, index) {
  return model.normalizeFillerToken(words[index].text);
}

function findPhraseIndexes(words, phrase) {
  const parts = phrase.split(" ").filter(Boolean);
  const hits = [];
  for (let i = 0; i <= words.length - parts.length; i += 1) {
    let ok = true;
    for (let j = 0; j < parts.length; j += 1) {
      if (tokenAt(words, i + j) !== parts[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push({ start: i, end: i + parts.length - 1 });
  }
  return hits;
}

function sentenceStartIndex(words, index) {
  for (let i = index; i >= 0; i -= 1) {
    if (i === 0) return 0;
    const prev = words[i - 1].text;
    if (/[.!?]/.test(prev) || words[i].startMs - words[i - 1].endMs > 1200) return i;
  }
  return 0;
}

function draftRemoveRetakes(transcript) {
  const next = model.cloneTranscript(transcript);
  const spoken = next.words.filter((word) => !word.isSilence);
  const deleteIds = new Set();

  RETAKE_PHRASES.forEach((phrase) => {
    findPhraseIndexes(spoken, phrase).forEach((hit) => {
      const start = sentenceStartIndex(spoken, hit.start);
      for (let i = start; i <= hit.end; i += 1) deleteIds.add(spoken[i].id);
    });
  });

  const n = 5;
  const windowMs = 60000;
  for (let i = 0; i <= spoken.length - n; i += 1) {
    const key = spoken
      .slice(i, i + n)
      .map((_word, offset) => tokenAt(spoken, i + offset))
      .join(" ");
    if (key.length < 12) continue;
    for (let j = i + n; j <= spoken.length - n; j += 1) {
      if (spoken[j].startMs - spoken[i].startMs > windowMs) break;
      const other = spoken
        .slice(j, j + n)
        .map((word, offset) => tokenAt(spoken, j + offset))
        .join(" ");
      if (other === key) {
        for (let k = 0; k < n; k += 1) deleteIds.add(spoken[i + k].id);
        break;
      }
    }
  }

  const draft = createDraft("retakes", next, Array.from(deleteIds), {
    note: "Heuristic retake cleanup (phrase cues + repeated 5-grams). Review before applying."
  });
  return { transcript: next, draft };
}

function speechDensity(words, startMs, endMs) {
  const inside = words.filter(
    (word) => !word.isSilence && !word.deleted && word.startMs < endMs && word.endMs > startMs
  );
  const spokenMs = inside.reduce((sum, word) => {
    const start = Math.max(word.startMs, startMs);
    const end = Math.min(word.endMs, endMs);
    return sum + Math.max(0, end - start);
  }, 0);
  return spokenMs / Math.max(1, endMs - startMs);
}

function draftShortformClips(transcript, { maxClipMs = 45000, maxClips = 3, minClipMs = 12000 } = {}) {
  const next = model.cloneTranscript(transcript);
  const windows = [];

  if (next.chapters && next.chapters.length) {
    next.chapters.slice(0, maxClips).forEach((chapter, index) => {
      const endMs = Math.min(chapter.endMs, chapter.startMs + maxClipMs);
      if (endMs - chapter.startMs >= minClipMs / 2) {
        windows.push({
          id: `clip-${index + 1}`,
          title: chapter.title || `Clip ${index + 1}`,
          startMs: chapter.startMs,
          endMs
        });
      }
    });
  }

  if (!windows.length) {
    const duration = next.durationMs || 0;
    const step = Math.max(4000, Math.floor(minClipMs / 3));
    const candidates = [];
    for (let start = 0; start + minClipMs <= duration; start += step) {
      const end = Math.min(duration, start + maxClipMs);
      candidates.push({
        startMs: start,
        endMs: end,
        score: speechDensity(next.words, start, end)
      });
    }
    candidates.sort((a, b) => b.score - a.score);
    const picked = [];
    candidates.forEach((candidate) => {
      if (picked.length >= maxClips) return;
      const overlaps = picked.some(
        (other) => candidate.startMs < other.endMs - 2000 && candidate.endMs > other.startMs + 2000
      );
      if (!overlaps) picked.push(candidate);
    });
    picked
      .sort((a, b) => a.startMs - b.startMs)
      .forEach((clip, index) => {
        windows.push({
          id: `clip-${index + 1}`,
          title: `Short ${index + 1}`,
          startMs: clip.startMs,
          endMs: clip.endMs
        });
      });
  }

  const wordIds = next.words
    .filter((word) => !windows.some((window) => word.startMs < window.endMs && word.endMs > window.startMs))
    .map((word) => word.id);

  const draft = createDraft("shortform", next, wordIds, {
    clipWindows: windows,
    note: "Keep only the highlighted shortform windows; everything else is marked deleted."
  });
  return { transcript: next, draft };
}

function diffDraft(original, draft) {
  if (!draft) return { addedDeletes: [], clipWindows: [] };
  const originalDeleted = new Set((original.words || []).filter((word) => word.deleted).map((word) => word.id));
  const addedDeletes = (draft.wordIdsToDelete || []).filter((id) => !originalDeleted.has(id));
  return { addedDeletes, clipWindows: draft.clipWindows || [] };
}

const api = {
  RETAKE_PHRASES,
  createDraft,
  applyDraftToTranscript,
  draftRemoveSilence,
  draftRemoveFillers,
  draftRemoveRetakes,
  draftShortformClips,
  diffDraft,
  speechDensity
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutTrim = api;
}
