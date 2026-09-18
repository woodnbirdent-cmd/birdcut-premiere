"use strict";
(function (root) {
const STORAGE_KEY = "birdcut.settings.v1";
const SECRET_KEY = "birdcut.stt.apiKey";
const SETTINGS_FILE = "birdcut-settings.json";

const DEFAULT_FILLERS = [
  "um",
  "uh",
  "erm",
  "like",
  "you know",
  "so",
  "actually",
  "basically",
  "kinda",
  "kind of",
  "sort of",
  "i mean"
];

const STT_PROVIDERS = ["mock", "adobe", "whisper", "local-whisper"];
const LOCAL_WHISPER_DEFAULT_URL = "http://127.0.0.1:8090/v1";
const LOCAL_WHISPER_DEFAULT_MODEL = "base";

const DEFAULT_SETTINGS = {
  language: "en",
  sttProvider: "mock",
  whisperBaseUrl: "https://api.openai.com/v1",
  whisperModel: "whisper-1",
  localWhisperBaseUrl: LOCAL_WHISPER_DEFAULT_URL,
  localWhisperModel: LOCAL_WHISPER_DEFAULT_MODEL,
  fillerList: DEFAULT_FILLERS.slice(),
  textSize: "md",
  silenceThresholdMs: 700,
  padCutMs: 40,
  includeSpeakerInCaptions: true,
  transcribeSource: "sequence",
  audioPresetPath: "",
  captionPresetId: "clean-lower-third",
  captionWordsPerCue: "",
  captionFontFamily: "",
  captionColor: "",
  captionOutlineColor: "",
  captionUppercase: false,
  captionAnimationFeel: ""
};

function normalizeStoredHex(value) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.slice(1).toUpperCase()}`;
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return raw;
}

function isWhisperLike(provider) {
  return provider === "whisper" || provider === "local-whisper";
}

function envApiKey() {
  if (typeof process !== "undefined" && process.env && process.env.BIRDCUT_STT_API_KEY) {
    return process.env.BIRDCUT_STT_API_KEY;
  }
  return "";
}

function normalizeSettings(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const fillerList = Array.isArray(input.fillerList)
    ? input.fillerList.map((item) => String(item).trim()).filter(Boolean)
    : String(input.fillerListText || "")
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  return {
    language: input.language || DEFAULT_SETTINGS.language,
    sttProvider: STT_PROVIDERS.indexOf(input.sttProvider) >= 0 ? input.sttProvider : "mock",
    whisperBaseUrl: String(input.whisperBaseUrl || DEFAULT_SETTINGS.whisperBaseUrl).replace(/\/+$/, ""),
    whisperModel: input.whisperModel || DEFAULT_SETTINGS.whisperModel,
    localWhisperBaseUrl: String(input.localWhisperBaseUrl || DEFAULT_SETTINGS.localWhisperBaseUrl).replace(
      /\/+$/,
      ""
    ),
    localWhisperModel: input.localWhisperModel || DEFAULT_SETTINGS.localWhisperModel,
    fillerList: fillerList.length ? fillerList : DEFAULT_FILLERS.slice(),
    textSize: ["sm", "md", "lg"].indexOf(input.textSize) >= 0 ? input.textSize : "md",
    silenceThresholdMs: Math.max(120, Number(input.silenceThresholdMs) || DEFAULT_SETTINGS.silenceThresholdMs),
    padCutMs: Math.max(0, Number(input.padCutMs) || DEFAULT_SETTINGS.padCutMs),
    includeSpeakerInCaptions:
      input.includeSpeakerInCaptions == null
        ? DEFAULT_SETTINGS.includeSpeakerInCaptions
        : Boolean(input.includeSpeakerInCaptions),
    transcribeSource: input.transcribeSource === "clip" ? "clip" : "sequence",
    audioPresetPath: String(input.audioPresetPath || "").trim(),
    captionPresetId: String(input.captionPresetId || DEFAULT_SETTINGS.captionPresetId).trim() || DEFAULT_SETTINGS.captionPresetId,
    captionWordsPerCue: ["1", "2", "phrase"].indexOf(String(input.captionWordsPerCue || "")) >= 0
      ? String(input.captionWordsPerCue)
      : DEFAULT_SETTINGS.captionWordsPerCue,
    captionFontFamily: String(input.captionFontFamily || "").trim(),
    captionColor: normalizeStoredHex(input.captionColor || ""),
    captionOutlineColor: normalizeStoredHex(input.captionOutlineColor || ""),
    captionUppercase:
      input.captionUppercase === true ||
      input.captionUppercase === "true" ||
      input.captionUppercase === "1" ||
      input.captionUppercase === "on",
    captionAnimationFeel: ["none", "karaoke", "pop"].indexOf(String(input.captionAnimationFeel || "")) >= 0
      ? String(input.captionAnimationFeel)
      : DEFAULT_SETTINGS.captionAnimationFeel
  };
}

function resolveWebStorage(preferred) {
  if (preferred && typeof preferred.getItem === "function") return preferred;
  try {
    if (typeof require === "function") {
      const uxp = require("uxp");
      if (uxp && uxp.storage && uxp.storage.localStorage && typeof uxp.storage.localStorage.getItem === "function") {
        return uxp.storage.localStorage;
      }
    }
  } catch (_err) {
    /* Node tests / browser preview */
  }
  if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
    return localStorage;
  }
  return preferred || null;
}

function createPluginFileStore(uxpStorage) {
  if (!uxpStorage || !uxpStorage.localFileSystem || typeof uxpStorage.localFileSystem.getDataFolder !== "function") {
    return null;
  }
  const fs = uxpStorage.localFileSystem;
  const formats = uxpStorage.formats || {};
  let folderPromise = null;

  function dataFolder() {
    if (!folderPromise) folderPromise = fs.getDataFolder();
    return folderPromise;
  }

  async function readText(file) {
    if (formats.utf8) return file.read({ format: formats.utf8 });
    return file.read();
  }

  async function writeText(file, payload) {
    if (formats.utf8) return file.write(payload, { format: formats.utf8 });
    return file.write(payload);
  }

  return {
    async read() {
      try {
        const folder = await dataFolder();
        const file = await folder.getEntry(SETTINGS_FILE);
        const raw = await readText(file);
        return raw ? JSON.parse(raw) : null;
      } catch (_err) {
        return null;
      }
    },
    async write(value) {
      const folder = await dataFolder();
      let file;
      try {
        file = await folder.createFile(SETTINGS_FILE, { overwrite: true });
      } catch (_err) {
        file = await folder.getEntry(SETTINGS_FILE);
      }
      await writeText(file, JSON.stringify(value));
    }
  };
}

function createSettingsStore(storage, secureStorage, fileStore) {
  const web = resolveWebStorage(storage);
  const memory = { settings: normalizeSettings(DEFAULT_SETTINGS), apiKey: envApiKey() };
  let writeQueue = Promise.resolve();

  async function readJson(key) {
    try {
      if (web && typeof web.getItem === "function") {
        const raw = web.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }
    } catch (_err) {
      /* ignore corrupt storage */
    }
    return null;
  }

  async function writeWebJson(key, value) {
    if (web && typeof web.setItem === "function") {
      try {
        web.setItem(key, JSON.stringify(value));
      } catch (_err) {
        /* Premiere hosts may reject window.localStorage */
      }
    }
  }

  async function persistSettings(next) {
    writeQueue = writeQueue
      .then(async () => {
        await writeWebJson(STORAGE_KEY, next);
        if (fileStore && typeof fileStore.write === "function") {
          await fileStore.write(next);
        }
      })
      .catch(() => {});
    await writeQueue;
  }

  async function readSecret() {
    try {
      if (secureStorage && typeof secureStorage.getItem === "function") {
        const value = await secureStorage.getItem(SECRET_KEY);
        if (value) return String(value);
      }
    } catch (_err) {
      /* Premiere hosts may not expose secureStorage */
    }
    try {
      if (web && typeof web.getItem === "function") {
        return web.getItem(SECRET_KEY) || "";
      }
    } catch (_err) {
      /* ignore */
    }
    return memory.apiKey || envApiKey();
  }

  async function writeSecret(apiKey) {
    memory.apiKey = apiKey || "";
    try {
      if (secureStorage && typeof secureStorage.setItem === "function") {
        await secureStorage.setItem(SECRET_KEY, memory.apiKey);
        return;
      }
    } catch (_err) {
      /* fallback below */
    }
    if (web && typeof web.setItem === "function") {
      if (memory.apiKey) web.setItem(SECRET_KEY, memory.apiKey);
      else if (typeof web.removeItem === "function") web.removeItem(SECRET_KEY);
    }
  }

  return {
    async load() {
      const fromLs = await readJson(STORAGE_KEY);
      let fromFile = null;
      if (fileStore && typeof fileStore.read === "function") {
        try {
          fromFile = await fileStore.read();
        } catch (_err) {
          fromFile = null;
        }
      }
      const raw = fromFile || fromLs || DEFAULT_SETTINGS;
      memory.settings = normalizeSettings(raw);
      if (fromFile && !fromLs) {
        await writeWebJson(STORAGE_KEY, memory.settings);
      } else if (fromLs && !fromFile && fileStore && typeof fileStore.write === "function") {
        try {
          await fileStore.write(memory.settings);
        } catch (_err) {
          /* ignore */
        }
      }
      memory.apiKey = (await readSecret()) || envApiKey();
      return this.get();
    },
    get() {
      return {
        ...normalizeSettings(memory.settings),
        hasApiKey: Boolean(memory.apiKey),
        apiKeyPreview: memory.apiKey ? `••••${memory.apiKey.slice(-4)}` : ""
      };
    },
    getApiKey() {
      return memory.apiKey || envApiKey();
    },
    async save(partial) {
      const next = normalizeSettings({ ...memory.settings, ...partial });
      memory.settings = next;
      await persistSettings(next);
      if (Object.prototype.hasOwnProperty.call(partial, "apiKey")) {
        await writeSecret(partial.apiKey);
      }
      return this.get();
    }
  };
}

const api = {
  STORAGE_KEY,
  SECRET_KEY,
  SETTINGS_FILE,
  DEFAULT_FILLERS,
  DEFAULT_SETTINGS,
  STT_PROVIDERS,
  LOCAL_WHISPER_DEFAULT_URL,
  LOCAL_WHISPER_DEFAULT_MODEL,
  isWhisperLike,
  normalizeSettings,
  createSettingsStore,
  createPluginFileStore,
  resolveWebStorage,
  envApiKey
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutSettings = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
