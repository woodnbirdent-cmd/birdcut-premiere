"use strict";

const STORAGE_KEY = "birdcut.settings.v1";
const SECRET_KEY = "birdcut.stt.apiKey";

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

const DEFAULT_SETTINGS = {
  language: "en",
  sttProvider: "mock",
  whisperBaseUrl: "https://api.openai.com/v1",
  whisperModel: "whisper-1",
  fillerList: DEFAULT_FILLERS.slice(),
  textSize: "md",
  silenceThresholdMs: 700,
  padCutMs: 40,
  includeSpeakerInCaptions: true
};

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
    sttProvider: input.sttProvider === "whisper" ? "whisper" : "mock",
    whisperBaseUrl: String(input.whisperBaseUrl || DEFAULT_SETTINGS.whisperBaseUrl).replace(/\/+$/, ""),
    whisperModel: input.whisperModel || DEFAULT_SETTINGS.whisperModel,
    fillerList: fillerList.length ? fillerList : DEFAULT_FILLERS.slice(),
    textSize: ["sm", "md", "lg"].indexOf(input.textSize) >= 0 ? input.textSize : "md",
    silenceThresholdMs: Math.max(120, Number(input.silenceThresholdMs) || DEFAULT_SETTINGS.silenceThresholdMs),
    padCutMs: Math.max(0, Number(input.padCutMs) || DEFAULT_SETTINGS.padCutMs),
    includeSpeakerInCaptions:
      input.includeSpeakerInCaptions == null
        ? DEFAULT_SETTINGS.includeSpeakerInCaptions
        : Boolean(input.includeSpeakerInCaptions)
  };
}

function createSettingsStore(storage, secureStorage) {
  const memory = { settings: normalizeSettings(DEFAULT_SETTINGS), apiKey: envApiKey() };

  async function readJson(key, fallback) {
    try {
      if (storage && typeof storage.getItem === "function") {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }
    } catch (_err) {
      /* ignore corrupt storage */
    }
    return fallback;
  }

  async function writeJson(key, value) {
    if (storage && typeof storage.setItem === "function") {
      storage.setItem(key, JSON.stringify(value));
    }
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
      if (storage && typeof storage.getItem === "function") {
        return storage.getItem(SECRET_KEY) || "";
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
    if (storage && typeof storage.setItem === "function") {
      if (memory.apiKey) storage.setItem(SECRET_KEY, memory.apiKey);
      else if (typeof storage.removeItem === "function") storage.removeItem(SECRET_KEY);
    }
  }

  return {
    async load() {
      memory.settings = normalizeSettings(await readJson(STORAGE_KEY, DEFAULT_SETTINGS));
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
      await writeJson(STORAGE_KEY, next);
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
  DEFAULT_FILLERS,
  DEFAULT_SETTINGS,
  normalizeSettings,
  createSettingsStore,
  envApiKey
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutSettings = api;
}
