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

function mapWhisperResponse(payload, sourceLabel, options) {
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
    source: {
      kind: (options && options.sourceKind) || "whisper",
      label: sourceLabel || ((options && options.sourceKind) === "local-whisper" ? "Local Whisper" : "Whisper")
    },
    language: body.language || "en",
    durationMs: body.durationMs != null ? body.durationMs : time.secondsToMs(body.duration),
    words,
    speakers,
    chapters
  });
}

function healthRoot(baseUrl) {
  const trimmed = String(baseUrl || "http://127.0.0.1:8090/v1").replace(/\/+$/, "");
  return trimmed.replace(/\/v1$/i, "") || "http://127.0.0.1:8090";
}

function sidecarNotRunningMessage(baseUrl) {
  const root = healthRoot(baseUrl);
  return `Start the Local Whisper sidecar. It is not running at ${root}. In Terminal: cd sidecar/local-whisper && ./start.sh`;
}

async function checkWhisperHealth(baseUrl, fetchImpl) {
  const fetchFn = fetchImpl || (typeof fetch === "function" ? fetch : null);
  const root = healthRoot(baseUrl);
  if (!fetchFn) {
    return { ok: false, root, message: sidecarNotRunningMessage(baseUrl) };
  }
  try {
    const response = await fetchFn(`${root}/health`, { method: "GET" });
    if (!response.ok) {
      return { ok: false, root, message: sidecarNotRunningMessage(baseUrl) };
    }
    const body = await response.json().catch(() => ({}));
    const modelName = body.model || "";
    const engine = body.engine || "faster-whisper";
    return {
      ok: true,
      root,
      model: modelName,
      engine,
      message: modelName
        ? `Local Whisper sidecar is running (${engine} ${modelName}).`
        : "Local Whisper sidecar is running."
    };
  } catch (_err) {
    return { ok: false, root, message: sidecarNotRunningMessage(baseUrl) };
  }
}

async function transcribeWithWhisper({
  audioBytes,
  fileName,
  mimeType,
  apiKey,
  baseUrl,
  modelName,
  language,
  fetchImpl,
  requireApiKey,
  sourceKind,
  sourceLabel
}) {
  const needsKey = requireApiKey !== false;
  if (needsKey && !apiKey) {
    throw new Error("Missing STT API key. Set it in Settings or BIRDCUT_STT_API_KEY.");
  }
  const fetchFn = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchFn) {
    throw new Error("No fetch implementation available for Whisper HTTP.");
  }

  const rootBase = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${rootBase}/audio/transcriptions`;
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

  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers,
      body: form
    });
  } catch (err) {
    if (!needsKey) {
      throw new Error(sidecarNotRunningMessage(rootBase));
    }
    throw err;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const snippet = detail.slice(0, 280);
    if (!needsKey && (response.status === 404 || response.status >= 500)) {
      throw new Error(sidecarNotRunningMessage(rootBase));
    }
    if (response.status === 401) {
      throw new Error(`Whisper HTTP 401 unauthorized. ${snippet}`);
    }
    if (response.status === 403) {
      throw new Error(`Whisper HTTP 403 forbidden. ${snippet}`);
    }
    throw new Error(`Whisper HTTP ${response.status}: ${snippet}`);
  }
  const payload = await response.json();
  return mapWhisperResponse(payload, sourceLabel || fileName || "Whisper", {
    sourceKind: sourceKind || "whisper"
  });
}

const api = {
  mapWhisperResponse,
  transcribeWithWhisper,
  wordsFromSegments,
  checkWhisperHealth,
  healthRoot,
  sidecarNotRunningMessage
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutWhisper = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
