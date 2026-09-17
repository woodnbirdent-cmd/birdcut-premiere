"use strict";
(function (root) {
function explainSttError(err, context) {
  const raw = err && err.message ? err.message : String(err || "Unknown error");
  const baseUrl = (context && context.baseUrl) || "the STT server";
  const source = (context && context.source) || "sequence";

  if (/missing stt api key/i.test(raw) || /api key/i.test(raw) && /missing|set it/i.test(raw)) {
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
  if (/no clip selected|no selection|per source clip|per ClipProjectItem/i.test(raw)) {
    return "No timeline clip selected. Select a source clip, then Transcribe clip — or use Transcribe sequence for Adobe native.";
  }
  if (/speech to text is not available|transcribeClipProjectItem is missing|25\.6/i.test(raw)) {
    return "Adobe Speech to Text needs Premiere Pro 25.6+. Update Premiere, Unload → Load BirdCut, then try again.";
  }
  if (/language pack|adobe cloud credits|failed for /i.test(raw) && /adobe|speech to text/i.test(raw)) {
    return raw;
  }
  if (/timed out|timeout/i.test(raw)) {
    return `Export timed out while bouncing the ${source}. Try a shorter range, or set an MP3/WAV .epr path in Settings.`;
  }
  if (/file too large|25 ?mb|max.*bytes/i.test(raw)) {
    return "Audio is larger than the Whisper upload limit (~25 MB). Bounce with an MP3 preset, or transcribe a shorter clip.";
  }
  return raw;
}

const api = { explainSttError };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutErrors = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
