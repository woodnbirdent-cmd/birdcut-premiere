"use strict";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pad2(n) {
  return String(Math.floor(n)).padStart(2, "0");
}

function pad3(n) {
  return String(Math.floor(n)).padStart(3, "0");
}

function msToSeconds(ms) {
  return (Number(ms) || 0) / 1000;
}

function secondsToMs(seconds) {
  return Math.round((Number(seconds) || 0) * 1000);
}

function formatTimecode(ms, { fps = 30, includeMs = false } = {}) {
  const total = Math.max(0, Number(ms) || 0);
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  if (includeMs) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(total % 1000)}`;
  }
  const frames = Math.floor(((total % 1000) / 1000) * fps);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}:${pad2(frames)}`;
}

function formatSrtTime(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(millis)}`;
}

function formatCompactDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${pad2(seconds)}s`;
}

const api = {
  clamp,
  pad2,
  pad3,
  msToSeconds,
  secondsToMs,
  formatTimecode,
  formatSrtTime,
  formatCompactDuration
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutTime = api;
}
