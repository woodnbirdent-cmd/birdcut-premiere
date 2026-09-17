"use strict";
(function (root) {
const PREMIERE_UNKNOWN_STT_MESSAGE =
  "Premiere Speech to Text failed (error -1609629681). Install an on-device language pack in Window → Text, select the source clip in the Project panel, or transcribe once in Premiere’s Text panel and run BirdCut Clip to import.";

function errorBlob(err) {
  if (err == null) return "";
  if (typeof err === "number" || typeof err === "bigint") return String(err);
  if (typeof err === "string") return err;
  const parts = [];
  try {
    if (err.message) parts.push(String(err.message));
    if (err.code != null) parts.push(String(err.code));
    if (err.error != null) parts.push(String(err.error));
    if (err.errorCode != null) parts.push(String(err.errorCode));
    if (err.name) parts.push(String(err.name));
    parts.push(String(err));
  } catch (_e) {
    parts.push(String(err));
  }
  return parts.join(" ");
}

function isPremiereUnknownSttError(err) {
  const blob = errorBlob(err);
  return /(?:-)?1609629681/.test(blob) || /0xa00f000f/i.test(blob) || /a00f000f/i.test(blob);
}

function explainSttError(err, context) {
  const raw = errorBlob(err);
  const baseUrl = (context && context.baseUrl) || "the STT server";
  const source = (context && context.source) || "sequence";

  if (isPremiereUnknownSttError(err)) {
    return PREMIERE_UNKNOWN_STT_MESSAGE;
  }
  if (/missing stt api key/i.test(raw) || (/api key/i.test(raw) && /missing|set it/i.test(raw))) {
    return "No Whisper API key. Settings → STT provider: Whisper → paste the key → Save. For Adobe Speech to Text, switch the provider to Adobe native (no OpenAI key).";
  }
  if (/401|unauthorized/i.test(raw)) {
    return "STT rejected the API key (HTTP 401). Check the key in Settings. It is stored locally, never in the repo.";
  }
  if (/403|forbidden/i.test(raw)) {
    return "STT forbade the request (HTTP 403). Check the key, model name, and that this account may call transcriptions.";
  }
  if (/permission denied to the url/i.test(raw)) {
    return `Premiere blocked ${baseUrl}. Add that origin to manifest.json requiredPermissions.network.domains (or keep "all") and Unload/Load the plugin.`;
  }
  if (/network request failed|failed to fetch|load failed/i.test(raw)) {
    return `Could not reach ${baseUrl}. Check the Whisper base URL, network/VPN, and that the server is running.`;
  }
  if (/empty audio|too small|0 bytes/i.test(raw)) {
    return "Exported audio was empty. Confirm the sequence/clip has audible audio, then retry Transcribe.";
  }
  if (/no audio-only|\.epr|preset/i.test(raw)) {
    return raw;
  }
  if (/no active sequence/i.test(raw)) {
    return "No active sequence. Open a sequence in the timeline, then Transcribe sequence.";
  }
  if (/nested sequence|cannot transcribe a sequence/i.test(raw)) {
    return raw;
  }
  if (/no clip selected|no selection|per source clip|per ClipProjectItem|Project panel/i.test(raw)) {
    return raw.indexOf("Project panel") >= 0
      ? raw
      : "Select a source clip in the Project panel (preferred) or on the timeline, then Transcribe clip / Import Premiere transcript. Nested sequences cannot be transcribed.";
  }
  if (/speech to text is not available|transcribeClipProjectItem is missing|25\.6/i.test(raw)) {
    return "Adobe Speech to Text needs Premiere Pro 25.6+. Update Premiere, Unload → Load BirdCut, then try again.";
  }
  if (/language pack|adobe cloud credits|failed for /i.test(raw) && /adobe|speech to text/i.test(raw)) {
    return raw;
  }
  if (/no premiere transcript/i.test(raw)) {
    return raw;
  }
  if (/timed out waiting for adobe|still transcribing/i.test(raw)) {
    return raw;
  }
  if (/timed out|timeout/i.test(raw)) {
    return `Export timed out while bouncing the ${source}. Try a shorter range, or set an MP3/WAV .epr path in Settings.`;
  }
  if (/file too large|25 ?mb|max.*bytes/i.test(raw)) {
    return "Audio is larger than the Whisper upload limit (~25 MB). Bounce with an MP3 preset, or transcribe a shorter clip.";
  }
  return err && err.message ? err.message : raw;
}

const api = {
  PREMIERE_UNKNOWN_STT_MESSAGE,
  errorBlob,
  isPremiereUnknownSttError,
  explainSttError
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutErrors = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
