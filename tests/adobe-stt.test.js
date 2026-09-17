"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { transcribeOne, exportReadyJson, createAdobeStt } = require("../src/premiere/adobe-stt");
const { PREMIERE_UNKNOWN_STT_MESSAGE } = require("../src/stt/errors");
const fixture = require("../fixtures/adobe-transcript.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function call(object, method, ...args) {
  if (!object || typeof object[method] !== "function") return null;
  return object[method](...args);
}

function tickToMs() {
  return 0;
}

describe("Adobe Premiere Transcript host wrapper", () => {
  it("reuses an existing transcript via exportToJSON", async () => {
    const item = { name: "A-roll", has: true };
    const T = {
      hasTranscript(clip) {
        return Boolean(clip.has);
      },
      async transcribeClipProjectItem() {
        throw new Error("should not transcribe when a transcript already exists");
      },
      async exportToJSON() {
        return JSON.stringify(fixture);
      }
    };
    const json = await transcribeOne(T, item, { name: "A-roll", timeoutMs: 2000, pollMs: 20 });
    assert.equal(json.language, "en-us");
    assert.equal(json.segments[0].words[0].text, "Hello");
  });

  it("importOnly exports without calling transcribeClipProjectItem", async () => {
    const item = { name: "Imported", has: true };
    const T = {
      hasTranscript(clip) {
        return Boolean(clip.has);
      },
      async transcribeClipProjectItem() {
        throw new Error("importOnly must not start Speech to Text");
      },
      async exportToJSON() {
        return JSON.stringify(fixture);
      }
    };
    const json = await transcribeOne(T, item, {
      name: "Imported",
      importOnly: true,
      timeoutMs: 2000,
      pollMs: 20
    });
    assert.equal(json.speakers[0].name, "Jane Doe");
  });

  it("importOnly fails fast when there is no Premiere transcript", async () => {
    const item = { name: "Empty", has: false };
    const T = {
      hasTranscript(clip) {
        return Boolean(clip.has);
      },
      async transcribeClipProjectItem() {
        throw new Error("should not transcribe in importOnly");
      },
      async exportToJSON() {
        throw new Error("should not poll export when hasTranscript is false");
      }
    };
    await assert.rejects(
      () => transcribeOne(T, item, { name: "Empty", importOnly: true, timeoutMs: 5000, pollMs: 20 }),
      /No Premiere transcript/i
    );
  });

  it("waits for transcribeClipProjectItem then exports JSON", async () => {
    const item = { name: "B-roll", has: false };
    const T = {
      hasTranscript(clip) {
        return Boolean(clip.has);
      },
      async transcribeClipProjectItem(clip, options) {
        assert.equal(options.language, "en-US");
        await sleep(10);
        clip.has = true;
        return true;
      },
      async exportToJSON(clip) {
        if (!clip.has) throw new Error("not ready");
        return JSON.stringify(fixture);
      }
    };
    const json = await transcribeOne(T, item, {
      languageCode: "en-US",
      name: "B-roll",
      timeoutMs: 2000,
      pollMs: 20
    });
    assert.ok(item.has);
    assert.equal(json.speakers[0].name, "Jane Doe");
  });

  it("omits language options when languageCode is empty", async () => {
    const item = { name: "Default", has: false };
    const T = {
      hasTranscript(clip) {
        return Boolean(clip.has);
      },
      async transcribeClipProjectItem(clip, options) {
        assert.equal(options, undefined);
        clip.has = true;
        return true;
      },
      async exportToJSON() {
        return JSON.stringify(fixture);
      }
    };
    const json = await transcribeOne(T, item, { name: "Default", timeoutMs: 2000, pollMs: 20 });
    assert.equal(json.language, "en-us");
  });

  it("retries without language after -1609629681 and maps the error if retry fails", async () => {
    const item = { name: "Retry", has: false };
    let calls = 0;
    const T = {
      hasTranscript() {
        return false;
      },
      async transcribeClipProjectItem(_clip, options) {
        calls += 1;
        if (options && options.language) throw new Error("Error: -1609629681");
        throw new Error("0xa00f000f");
      },
      async exportToJSON() {
        throw new Error("should not export");
      }
    };
    await assert.rejects(
      () => transcribeOne(T, item, { languageCode: "zz-ZZ", name: "Retry", timeoutMs: 2000, pollMs: 20 }),
      (err) => {
        assert.equal(err.message, PREMIERE_UNKNOWN_STT_MESSAGE);
        return true;
      }
    );
    assert.equal(calls, 2);
  });

  it("explains packs/credits when transcribeClipProjectItem returns false", async () => {
    const item = { name: "Nope", has: false };
    const T = {
      hasTranscript() {
        return false;
      },
      async transcribeClipProjectItem() {
        return false;
      },
      async exportToJSON() {
        throw new Error("should not export");
      }
    };
    await assert.rejects(
      () => transcribeOne(T, item, { name: "Nope", timeoutMs: 2000, pollMs: 20 }),
      /language pack|cloud credits/i
    );
  });

  it("fails fast when exportToJSON throws -1609629681 instead of polling for minutes", async () => {
    const item = { name: "ExportFail", has: true };
    const started = Date.now();
    const T = {
      hasTranscript() {
        return true;
      },
      async transcribeClipProjectItem() {
        throw new Error("should skip transcribe");
      },
      async exportToJSON() {
        throw new Error("unknown error 1609629681");
      }
    };
    await assert.rejects(
      () => exportReadyJson(T, item, { name: "ExportFail", timeoutMs: 30000, pollMs: 20 }),
      (err) => {
        assert.equal(err.message, PREMIERE_UNKNOWN_STT_MESSAGE);
        return true;
      }
    );
    assert.ok(Date.now() - started < 5000);
  });
});

describe("Adobe captureAdobe selection and language guard", () => {
  it("prefers a Project-panel ClipProjectItem and skips transcribe when hasTranscript is true", async () => {
    const clipItem = {
      name: "ProjectClip",
      async isSequence() {
        return false;
      },
      async getMediaFilePath() {
        return "/tmp/a.mov";
      },
      async getName() {
        return "ProjectClip";
      }
    };
    let transcribed = 0;
    const ppro = {
      ClipProjectItem: {
        cast(item) {
          return item;
        }
      },
      Project: {
        async getActiveProject() {
          return {
            async getActiveSequence() {
              return { name: "Seq", async getSelection() { return { async getTrackItems() { return []; } }; } };
            }
          };
        }
      },
      ProjectUtils: {
        async getSelection() {
          return {
            async getItems() {
              return [clipItem];
            }
          };
        }
      },
      Transcript: {
        hasTranscript() {
          return true;
        },
        async transcribeClipProjectItem() {
          transcribed += 1;
          throw new Error("should not transcribe");
        },
        async exportToJSON() {
          return JSON.stringify(fixture);
        },
        querySupportedLanguages() {
          return [{ languageCode: "en-US", displayString: "English (US)", locale: "en-us" }];
        },
        isLanguagePackAvailable() {
          return true;
        }
      }
    };
    const adobe = createAdobeStt({ ppro, call, tickToMs });
    const result = await adobe.captureAdobe({ source: "clip", language: "en", timeoutMs: 2000, pollMs: 20 });
    assert.equal(transcribed, 0);
    assert.equal(result.words[0].text, "Hello");
    assert.match(result.source.label, /ProjectClip/);
  });

  it("does not pass language when the on-device pack is unavailable", async () => {
    const clipItem = {
      name: "NeedPack",
      has: false,
      async isSequence() {
        return false;
      },
      async getMediaFilePath() {
        return "/tmp/b.mov";
      }
    };
    const languages = [];
    const ppro = {
      ClipProjectItem: {
        cast(item) {
          return item;
        }
      },
      Project: {
        async getActiveProject() {
          return {
            async getActiveSequence() {
              return { name: "Seq" };
            }
          };
        }
      },
      ProjectUtils: {
        async getSelection() {
          return {
            async getItems() {
              return [clipItem];
            }
          };
        }
      },
      Transcript: {
        hasTranscript(clip) {
          return Boolean(clip.has);
        },
        async transcribeClipProjectItem(clip, options) {
          languages.push(options);
          clip.has = true;
          return true;
        },
        async exportToJSON() {
          return JSON.stringify(fixture);
        },
        querySupportedLanguages() {
          return [{ languageCode: "en-US", displayString: "English (US)", locale: "en-us" }];
        },
        isLanguagePackAvailable() {
          return false;
        }
      }
    };
    const adobe = createAdobeStt({ ppro, call, tickToMs });
    await adobe.captureAdobe({ source: "clip", language: "en", timeoutMs: 2000, pollMs: 20 });
    assert.equal(languages.length, 1);
    assert.equal(languages[0], undefined);
  });

  it("rejects nested sequences selected in the Project panel", async () => {
    const nested = {
      name: "NestedSeq",
      async isSequence() {
        return true;
      }
    };
    const ppro = {
      ClipProjectItem: {
        cast(item) {
          return item;
        }
      },
      Project: {
        async getActiveProject() {
          return {
            async getActiveSequence() {
              return null;
            }
          };
        }
      },
      ProjectUtils: {
        async getSelection() {
          return {
            async getItems() {
              return [nested];
            }
          };
        }
      },
      Transcript: {
        async exportToJSON() {
          return "{}";
        }
      }
    };
    const adobe = createAdobeStt({ ppro, call, tickToMs });
    await assert.rejects(() => adobe.captureAdobe({ source: "clip" }), /nested sequence/i);
  });
});
