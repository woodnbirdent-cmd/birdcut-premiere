"use strict";
(function (root) {
const WHISPER_MAX_BYTES = 24 * 1024 * 1024;
const MIN_AUDIO_BYTES = 256;

const DIRECT_AUDIO_EXT = [".wav", ".wave", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".wma"];
const DIRECT_CONTAINER_EXT = [".mp4", ".mov", ".m4v", ".mkv", ".avi"];

function extOf(filePath) {
  const name = String(filePath || "").split(/[/\\]/).pop() || "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function canSendFileDirectly(filePath, byteLength) {
  const ext = extOf(filePath);
  const allowed = DIRECT_AUDIO_EXT.indexOf(ext) >= 0 || DIRECT_CONTAINER_EXT.indexOf(ext) >= 0;
  if (!allowed) return false;
  if (byteLength == null) return DIRECT_AUDIO_EXT.indexOf(ext) >= 0;
  return byteLength >= MIN_AUDIO_BYTES && byteLength <= WHISPER_MAX_BYTES;
}

function mimeForPath(filePath) {
  const ext = extOf(filePath);
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a" || ext === ".aac") return "audio/mp4";
  if (ext === ".mp4" || ext === ".m4v" || ext === ".mov") return "video/mp4";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".flac") return "audio/flac";
  return "audio/wav";
}

function scorePresetName(name) {
  const n = String(name || "").toLowerCase();
  if (!n.endsWith(".epr")) return -1;
  if (n.indexOf("mp3") >= 0 && (n.indexOf("128") >= 0 || n.indexOf("192") >= 0)) return 100;
  if (n.indexOf("mp3") >= 0 || n.indexOf("mpeg audio") >= 0) return 90;
  if (n.indexOf("aac") >= 0 && n.indexOf("audio") >= 0) return 80;
  if (n.indexOf("wave") >= 0 && n.indexOf("48") >= 0) return 70;
  if (n.indexOf("wav") >= 0 || n.indexOf("wave") >= 0 || n.indexOf("aiff") >= 0) return 60;
  if (n.indexOf("audio") >= 0 && n.indexOf("only") >= 0) return 50;
  return -1;
}

function defaultPresetRoots({ homeDir, extraRoots } = {}) {
  const home = homeDir || "";
  const macApps = [
    "/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Premiere Pro 2026.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Premiere Pro 2025.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Media Encoder 2026/Adobe Media Encoder 2026.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Media Encoder 2026.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Media Encoder 2025/Adobe Media Encoder 2025.app/Contents/MediaIO/systempresets",
    "/Applications/Adobe Media Encoder 2025.app/Contents/MediaIO/systempresets"
  ];
  const winApps = [
    "C:/Program Files/Adobe/Adobe Premiere Pro 2026/MediaIO/systempresets",
    "C:/Program Files/Adobe/Adobe Premiere Pro 2025/MediaIO/systempresets",
    "C:/Program Files/Adobe/Adobe Media Encoder 2026/MediaIO/systempresets",
    "C:/Program Files/Adobe/Adobe Media Encoder 2025/MediaIO/systempresets"
  ];
  const user = home
    ? [
        `${home}/Documents/Adobe/Adobe Media Encoder/26.0/Presets`,
        `${home}/Documents/Adobe/Adobe Media Encoder/25.0/Presets`,
        `${home}/Documents/Adobe/Adobe Media Encoder/24.0/Presets`
      ]
    : [];
  return macApps.concat(winApps, user, extraRoots || []);
}

const api = {
  WHISPER_MAX_BYTES,
  MIN_AUDIO_BYTES,
  DIRECT_AUDIO_EXT,
  canSendFileDirectly,
  mimeForPath,
  scorePresetName,
  defaultPresetRoots,
  extOf
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutPresets = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
