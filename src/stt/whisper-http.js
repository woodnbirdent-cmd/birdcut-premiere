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

function wordsFromSegments(segments) {
  const words = [];
  (segments || []).forEach((segment) => {
    if (Array.isArray(segment.words) && segment.words.length) {
      segment.words.forEach((word) => {
        words.push({
          text: word.word || word.text || "",
          startMs: time.secondsToMs(word.start != null ? word.start : segment.start),
          endMs: time.secondsToMs(word.end != null ? word.end : segment.end),
          speakerId: word.speaker || segment.speaker || segment.speaker_id || null
        });
      });
      return;
    }
    const text = String(segment.text || "").trim();
    if (!text) return;
    const tokens = text.split(/\s+/);
    const startMs = time.secondsToMs(segment.start);
    const endMs = time.secondsToMs(segment.end);
    const span = Math.max(tokens.length, 1);
    tokens.forEach((token, index) => {
      const t0 = startMs + ((endMs - startMs) * index) / span;
      const t1 = startMs + ((endMs - startMs) * (index + 1)) / span;
      words.push({
        text: token,
        startMs: t0,
        endMs: t1,
        speakerId: segment.speaker || segment.speaker_id || null
      });
    });
  });
  return words;
}

function mapWhisperResponse(payload, sourceLabel) {
  const body = payload && typeof payload === "object" ? payload : {};
  let words = [];
  if (Array.isArray(body.words) && body.words.length) {
    words = body.words.map((word) => ({
      text: word.word || word.text || "",
      startMs: word.startMs != null ? word.startMs : time.secondsToMs(word.start),
      endMs: word.endMs != null ? word.endMs : time.secondsToMs(word.end),
      speakerId: word.speaker || word.speakerId || null
    }));
  } else {
    words = wordsFromSegments(body.segments || []);
  }

  const speakers = [];
  const seen = new Set();
  words.forEach((word) => {
    if (word.speakerId && !seen.has(word.speakerId)) {
      seen.add(word.speakerId);
      speakers.push({ id: word.speakerId, label: word.speakerId });
    }
  });

  const chapters = Array.isArray(body.chapters)
    ? body.chapters
    : Array.isArray(body.segments)
      ? body.segments
          .filter((segment) => segment.title)
          .map((segment, index) => ({
            id: `c${index + 1}`,
            title: segment.title,
            startMs: time.secondsToMs(segment.start),
            endMs: time.secondsToMs(segment.end)
          }))
      : [];

  return model.normalizeTranscript({
    source: { kind: "whisper", label: sourceLabel || "Whisper" },
    language: body.language || "en",
    durationMs: body.durationMs != null ? body.durationMs : time.secondsToMs(body.duration),
    words,
    speakers,
    chapters
  });
}

async function transcribeWithWhisper({
  audioBytes,
  fileName,
  mimeType,
  apiKey,
  baseUrl,
  modelName,
  language,
  fetchImpl
}) {
  if (!apiKey) {
    throw new Error("Missing STT API key. Set it in Settings or BIRDCUT_STT_API_KEY.");
  }
  const fetchFn = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchFn) {
    throw new Error("No fetch implementation available for Whisper HTTP.");
  }

  const url = `${String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "")}/audio/transcriptions`;
  const form = new FormData();
  const blob =
    typeof Blob === "function"
      ? new Blob([audioBytes], { type: mimeType || "audio/wav" })
      : audioBytes;
  if (typeof File === "function") {
    form.append("file", new File([blob], fileName || "audio.wav", { type: mimeType || "audio/wav" }));
  } else {
    form.append("file", blob, fileName || "audio.wav");
  }
  form.append("model", modelName || "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (language) form.append("language", language);

  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const snippet = detail.slice(0, 280);
    if (response.status === 401) {
      throw new Error(`Whisper HTTP 401 unauthorized. ${snippet}`);
    }
    if (response.status === 403) {
      throw new Error(`Whisper HTTP 403 forbidden. ${snippet}`);
    }
    throw new Error(`Whisper HTTP ${response.status}: ${snippet}`);
  }
  const payload = await response.json();
  return mapWhisperResponse(payload, fileName || "Whisper");
}

const api = { mapWhisperResponse, transcribeWithWhisper, wordsFromSegments };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutWhisper = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
