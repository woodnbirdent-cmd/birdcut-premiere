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

function mergeRanges(ranges, { padMs = 0, minMs = 1 } = {}) {
  const padded = (ranges || [])
    .map((range) => ({
      startMs: (Number(range.startMs) || 0) - padMs,
      endMs: (Number(range.endMs) || 0) + padMs,
      reason: range.reason || "deleted",
      wordIds: Array.isArray(range.wordIds) ? range.wordIds.slice() : []
    }))
    .map((range) => ({
      ...range,
      startMs: Math.max(0, range.startMs),
      endMs: Math.max(0, range.endMs)
    }))
    .filter((range) => range.endMs - range.startMs >= minMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged = [];
  padded.forEach((range) => {
    const last = merged[merged.length - 1];
    if (!last || range.startMs > last.endMs) {
      merged.push({ ...range, wordIds: range.wordIds.slice() });
      return;
    }
    last.endMs = Math.max(last.endMs, range.endMs);
    last.wordIds.push(...range.wordIds);
    if (range.reason && last.reason && last.reason.split(",").indexOf(range.reason) === -1) {
      last.reason = `${last.reason},${range.reason}`;
    }
  });
  return merged;
}

function invertRanges(removeRanges, durationMs) {
  const duration = Math.max(0, Number(durationMs) || 0);
  const merged = mergeRanges(removeRanges);
  const keep = [];
  let cursor = 0;
  merged.forEach((range) => {
    const start = time.clamp(range.startMs, 0, duration);
    const end = time.clamp(range.endMs, 0, duration);
    if (start > cursor) keep.push({ startMs: cursor, endMs: start });
    cursor = Math.max(cursor, end);
  });
  if (cursor < duration) keep.push({ startMs: cursor, endMs: duration });
  return keep;
}

function deletedRangesFromTranscript(transcript) {
  const words = (transcript.words || []).slice().sort((a, b) => a.startMs - b.startMs);
  const ranges = [];
  let current = null;
  words.forEach((word) => {
    if (!word.deleted) {
      current = null;
      return;
    }
    const reason = word.isSilence ? "silence" : word.isFiller ? "filler" : "deleted";
    if (current && word.startMs <= current.endMs + 1) {
      current.endMs = Math.max(current.endMs, word.endMs);
      current.wordIds.push(word.id);
      if (current.reason.split(",").indexOf(reason) === -1) {
        current.reason = `${current.reason},${reason}`;
      }
      return;
    }
    current = {
      startMs: word.startMs,
      endMs: word.endMs,
      reason,
      wordIds: [word.id]
    };
    ranges.push(current);
  });
  return ranges;
}

function removedDurationBefore(removeRanges, timestampMs) {
  let removed = 0;
  (removeRanges || []).forEach((range) => {
    if (range.endMs <= timestampMs) {
      removed += range.endMs - range.startMs;
    } else if (range.startMs < timestampMs) {
      removed += timestampMs - range.startMs;
    }
  });
  return removed;
}

function mapTimeThroughCuts(timestampMs, removeRanges) {
  const merged = mergeRanges(removeRanges);
  for (let i = 0; i < merged.length; i += 1) {
    const range = merged[i];
    if (timestampMs >= range.startMs && timestampMs < range.endMs) {
      return range.startMs - removedDurationBefore(merged, range.startMs);
    }
  }
  return timestampMs - removedDurationBefore(merged, timestampMs);
}

function keepPiecesForItem(item, removeRanges) {
  const overlaps = mergeRanges(removeRanges)
    .filter((range) => range.endMs > item.startMs && range.startMs < item.endMs)
    .sort((a, b) => a.startMs - b.startMs);
  const pieces = [];
  let cursor = item.startMs;
  overlaps.forEach((range) => {
    const start = Math.max(range.startMs, item.startMs);
    const end = Math.min(range.endMs, item.endMs);
    if (start > cursor) pieces.push({ startMs: cursor, endMs: start });
    cursor = Math.max(cursor, end);
  });
  if (cursor < item.endMs) pieces.push({ startMs: cursor, endMs: item.endMs });
  return pieces;
}

function planCutsFromTranscript(transcript, options) {
  const opts = options || {};
  const ranges = mergeRanges(deletedRangesFromTranscript(transcript), {
    padMs: opts.padMs || 0,
    minMs: opts.minMs == null ? 1 : opts.minMs
  });
  const durationMs = Math.max(Number(transcript.durationMs) || 0, ...ranges.map((range) => range.endMs));
  const keepRanges = invertRanges(ranges, durationMs);
  const totalRemovedMs = ranges.reduce((sum, range) => sum + (range.endMs - range.startMs), 0);
  const totalKeptMs = keepRanges.reduce((sum, range) => sum + (range.endMs - range.startMs), 0);
  return {
    removeRanges: ranges,
    keepRanges,
    durationMs,
    totalRemovedMs,
    totalKeptMs,
    applyOrder: ranges.slice().sort((a, b) => b.startMs - a.startMs)
  };
}

function planTrackEdits(trackItems, removeRanges, options) {
  const opts = options || {};
  const ranges = mergeRanges(removeRanges, { padMs: opts.padMs || 0, minMs: opts.minMs == null ? 1 : opts.minMs });
  const operations = [];
  const targetClips = [];

  (trackItems || []).forEach((item) => {
    const pieces = keepPiecesForItem(item, ranges);
    if (pieces.length === 0) {
      operations.push({
        type: "remove",
        itemId: item.id,
        trackIndex: item.trackIndex,
        mediaType: item.mediaType,
        startMs: item.startMs,
        endMs: item.endMs
      });
      return;
    }

    pieces.forEach((piece, pieceIndex) => {
      const inOffset = piece.startMs - item.startMs;
      const duration = piece.endMs - piece.startMs;
      const inPointMs = (item.inPointMs || 0) + inOffset;
      const outPointMs = inPointMs + duration;
      const startMs = mapTimeThroughCuts(piece.startMs, ranges);
      const clip = {
        sourceId: item.id,
        pieceIndex,
        inPointMs,
        outPointMs,
        startMs,
        endMs: startMs + duration,
        trackIndex: item.trackIndex,
        mediaType: item.mediaType
      };
      targetClips.push(clip);

      if (pieceIndex === 0) {
        if (Math.abs(inPointMs - (item.inPointMs || 0)) >= 1) {
          operations.push({ type: "setInPoint", itemId: item.id, inPointMs });
        }
        if (Math.abs(outPointMs - (item.outPointMs || item.inPointMs + (item.endMs - item.startMs))) >= 1) {
          operations.push({ type: "setOutPoint", itemId: item.id, outPointMs });
        }
        if (Math.abs(startMs - item.startMs) >= 1) {
          operations.push({ type: "setStart", itemId: item.id, startMs });
        }
        return;
      }

      operations.push({
        type: "cloneTrim",
        itemId: item.id,
        inPointMs,
        outPointMs,
        startMs,
        timeOffsetMs: startMs - item.startMs,
        trackIndex: item.trackIndex,
        mediaType: item.mediaType
      });
    });
  });

  operations.sort((a, b) => {
    const rank = { cloneTrim: 0, setInPoint: 1, setOutPoint: 2, setStart: 3, remove: 4 };
    return (rank[a.type] || 9) - (rank[b.type] || 9);
  });

  return {
    operations,
    targetClips,
    removeRanges: ranges,
    notes: [
      "Middle cuts are reconstructed as clone + in/out because Premiere UXP has no razor API.",
      "Apply setStart operations after trims; save the project before applying."
    ]
  };
}

function createRippleCutPlan(transcript, trackItems, options) {
  const cutPlan = planCutsFromTranscript(transcript, options);
  const trackPlan = planTrackEdits(trackItems || [], cutPlan.removeRanges, options);
  return {
    ...cutPlan,
    ...trackPlan,
    removeRanges: cutPlan.removeRanges
  };
}

const api = {
  mergeRanges,
  invertRanges,
  deletedRangesFromTranscript,
  removedDurationBefore,
  mapTimeThroughCuts,
  keepPiecesForItem,
  planCutsFromTranscript,
  planTrackEdits,
  createRippleCutPlan
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutPlanner = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
