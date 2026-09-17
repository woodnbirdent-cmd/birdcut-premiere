"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { transcribeAudio } = require("../src/stt/transcribe");
const {
  transcribeWithWhisper,
  checkWhisperHealth,
  healthRoot,
  sidecarNotRunningMessage
} = require("../src/stt/whisper-http");
const { createPanelController } = require("../src/ui/panel");
const fixture = require("../fixtures/sample-transcript.json");

function fakeRoot() {
  const doc = { addEventListener() {} };
  return {
    innerHTML: "",
    ownerDocument: doc,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

describe("Local Whisper sidecar protocol", () => {
  it("strips /v1 for GET /health", () => {
    assert.equal(healthRoot("http://127.0.0.1:8090/v1"), "http://127.0.0.1:8090");
    assert.equal(healthRoot("http://127.0.0.1:8090/v1/"), "http://127.0.0.1:8090");
    assert.match(sidecarNotRunningMessage("http://127.0.0.1:8090/v1"), /Start the Local Whisper sidecar/);
  });

  it("reports sidecar health from GET /health", async () => {
    const urls = [];
    const health = await checkWhisperHealth("http://127.0.0.1:8090/v1", async (url) => {
      urls.push(String(url));
      return {
        ok: true,
        json: async () => ({ ok: true, engine: "faster-whisper", model: "base" })
      };
    });
    assert.deepEqual(urls, ["http://127.0.0.1:8090/health"]);
    assert.equal(health.ok, true);
    assert.match(health.message, /faster-whisper base/);
  });

  it("treats a down sidecar as not running", async () => {
    const health = await checkWhisperHealth("http://127.0.0.1:8090/v1", async () => {
      throw new Error("ECONNREFUSED");
    });
    assert.equal(health.ok, false);
    assert.match(health.message, /sidecar\/local-whisper/);
  });

  it("POSTs verbose_json without an API key", async () => {
    const seen = [];
    const transcript = await transcribeWithWhisper({
      audioBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      fileName: "seq.mp3",
      mimeType: "audio/mpeg",
      requireApiKey: false,
      baseUrl: "http://127.0.0.1:8090/v1",
      modelName: "base",
      language: "en",
      sourceLabel: "Local Whisper",
      fetchImpl: async (url, opts) => {
        seen.push({ url: String(url), headers: opts.headers || {}, method: opts.method });
        return {
          ok: true,
          json: async () => ({
            language: "en",
            duration: 0.4,
            words: [{ word: "Hello", start: 0, end: 0.4 }]
          })
        };
      }
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "http://127.0.0.1:8090/v1/audio/transcriptions");
    assert.equal(seen[0].headers.Authorization, undefined);
    assert.equal(transcript.source.label, "Local Whisper");
    assert.equal(transcript.words[0].text, "Hello");
  });

  it("maps a connection failure to the start-sidecar message", async () => {
    await assert.rejects(
      () =>
        transcribeWithWhisper({
          audioBytes: new Uint8Array([1, 2, 3, 4]),
          requireApiKey: false,
          baseUrl: "http://127.0.0.1:8090/v1",
          fetchImpl: async () => {
            throw new Error("Failed to fetch");
          }
        }),
      /Start the Local Whisper sidecar/
    );
  });

  it("routes local-whisper without requiring an API key", async () => {
    const transcript = await transcribeAudio(
      {
        audioBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        fileName: "bounce.mp3",
        mimeType: "audio/mpeg",
        alignment: { kind: "sequence", offsetMs: 1000, label: "Main" }
      },
      {
        sttProvider: "local-whisper",
        localWhisperBaseUrl: "http://127.0.0.1:8090/v1",
        localWhisperModel: "base",
        language: "en",
        silenceThresholdMs: 700,
        fillerList: []
      },
      {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({
            duration: 0.5,
            words: [{ word: "Hi", start: 0, end: 0.4 }]
          })
        })
      }
    );
    const spoken = transcript.words.filter((word) => !word.isSilence);
    assert.equal(spoken[0].text, "Hi");
    assert.equal(spoken[0].startMs, 1000);
    assert.equal(transcript.source.kind, "whisper");
    assert.equal(transcript.source.origin, "sequence");
  });

  it("ships an OpenAI-compatible faster-whisper sidecar", () => {
    const server = fs.readFileSync(path.join(__dirname, "../sidecar/local-whisper/server.py"), "utf8");
    assert.match(server, /\/v1\/audio\/transcriptions/);
    assert.match(server, /\/health/);
    assert.match(server, /faster_whisper|faster-whisper/);
    assert.match(server, /word_timestamps/);
    assert.match(server, /verbose_json|to_verbose_json/);
    assert.ok(fs.existsSync(path.join(__dirname, "../sidecar/local-whisper/start.sh")));
    assert.ok(fs.existsSync(path.join(__dirname, "../sidecar/local-whisper/requirements.txt")));
  });
});

describe("Local Whisper panel", () => {
  it("selects Local Whisper, bounces the sequence, and does not need an OpenAI key", async () => {
    const origFetch = global.fetch;
    const captured = [];
    const posts = [];
    global.fetch = async (url, opts) => {
      const href = String(url);
      if (href.endsWith("/health")) {
        return {
          ok: true,
          json: async () => ({ ok: true, engine: "faster-whisper", model: "base" })
        };
      }
      posts.push({ href, authorization: opts && opts.headers && opts.headers.Authorization });
      return {
        ok: true,
        json: async () => ({
          duration: 0.3,
          words: [{ word: "Hello", start: 0, end: 0.3 }]
        })
      };
    };
    try {
      const memory = {
        "birdcut.settings.v1": JSON.stringify({
          sttProvider: "local-whisper",
          localWhisperBaseUrl: "http://127.0.0.1:8090/v1",
          audioPresetPath: "/tmp/BirdCut Audio MP3.epr"
        })
      };
      const storage = {
        getItem(key) {
          return memory[key] || null;
        },
        setItem(key, value) {
          memory[key] = String(value);
        },
        removeItem(key) {
          delete memory[key];
        }
      };
      const root = fakeRoot();
      const controller = createPanelController({
        root,
        host: {
          available: true,
          async getStatus() {
            return { available: true, message: "Seq", sequenceName: "Seq" };
          },
          async getSequenceSnapshot() {
            return { items: [] };
          },
          async captureAudio({ source, onProgress }) {
            captured.push(source);
            onProgress({ stage: "exporting", message: "Exporting sequence audio…" });
            return {
              audioBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
              fileName: "seq.mp3",
              mimeType: "audio/mpeg",
              alignment: { kind: "sequence", offsetMs: 0, label: "Seq" }
            };
          }
        },
        storage,
        fixture
      });
      await controller.mount();
      assert.equal(controller.getState().settings.sttProvider, "local-whisper");
      assert.match(root.innerHTML, /Transcribe sequence/);
      assert.match(root.innerHTML, /Local Whisper sidecar is running/);
      await controller.transcribe("sequence");
      assert.deepEqual(captured, ["sequence"]);
      assert.equal(posts.length, 1);
      assert.equal(posts[0].authorization, undefined);
      const spoken = controller.getState().transcript.words.filter((word) => !word.isSilence);
      assert.equal(spoken[0].text, "Hello");
      assert.match(controller.getState().message, /words from Seq/i);
    } finally {
      global.fetch = origFetch;
    }
  });

  it("surfaces Start the Local Whisper sidecar when health fails", async () => {
    const origFetch = global.fetch;
    global.fetch = async () => {
      throw new Error("Failed to fetch");
    };
    try {
      const memory = {
        "birdcut.settings.v1": JSON.stringify({ sttProvider: "local-whisper" })
      };
      const storage = {
        getItem(key) {
          return memory[key] || null;
        },
        setItem(key, value) {
          memory[key] = String(value);
        },
        removeItem(key) {
          delete memory[key];
        }
      };
      const root = fakeRoot();
      const controller = createPanelController({
        root,
        host: {
          available: true,
          async getStatus() {
            return { available: true, message: "Seq", sequenceName: "Seq" };
          },
          async getSequenceSnapshot() {
            return { items: [] };
          },
          async captureAudio() {
            throw new Error("should not bounce when sidecar is down");
          }
        },
        storage,
        fixture
      });
      await controller.mount();
      assert.match(root.innerHTML, /Start the Local Whisper sidecar/);
      await controller.transcribe("sequence");
      assert.match(controller.getState().message, /sidecar/i);
    } finally {
      global.fetch = origFetch;
    }
  });
});
