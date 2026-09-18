"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const applyCaptions = require("../src/premiere/apply-captions");

describe("apply captions to sequence", () => {
  it("finds the newly imported SRT among project items", () => {
    const before = new Set(["clip.mov"]);
    const after = [{ name: "clip.mov", guid: "clip.mov" }, { name: "birdcut-captions-1.srt", guid: "cap" }];
    const found = applyCaptions.findImportedItem(before, after, "birdcut-captions-1.srt");
    assert.equal(found.name, "birdcut-captions-1.srt");
  });

  it("inserts onto a new video track index without requiring caption tracks", () => {
    const indexes = applyCaptions.chooseInsertTrackIndexes({ videoCount: 2, captionCount: 0 });
    assert.equal(indexes.videoTrackIndex, 2);
    assert.equal(indexes.audioTrackIndex, 0);
  });

  it("does not treat missing cut ranges as a caption failure", () => {
    const imported = applyCaptions.summarizeCaptionApply({
      imported: true,
      inserted: true,
      captionCountBefore: 0,
      captionCountAfter: 1,
      cueCount: 12,
      presetName: "Karaoke",
      fileName: "birdcut-captions.srt",
      warnings: []
    });
    assert.equal(imported.ok, true);
    assert.doesNotMatch(imported.message, /deleted range/i);

    const binOnly = applyCaptions.summarizeCaptionApply({
      imported: true,
      inserted: false,
      captionCountBefore: 0,
      captionCountAfter: 0,
      cueCount: 12,
      presetName: "Clean Lower Third",
      fileName: "birdcut-captions.srt",
      warnings: ["Insert failed"]
    });
    assert.equal(binOnly.ok, true);
    assert.match(binOnly.message, /Project panel/i);
    assert.match(binOnly.message, /drag/i);
  });

  it("writes SRT, imports it, and inserts without needing deleted ranges", async () => {
    const written = [];
    const importedPaths = [];
    const actions = [];
    let captionCount = 0;
    const srtItem = { name: "birdcut-captions-1.srt", guid: "cap-1" };
    const root = {
      async getItems() {
        return captionCount > 0 ? [{ name: "A-roll.mov", guid: "clip" }, srtItem] : [{ name: "A-roll.mov", guid: "clip" }];
      }
    };
    const sequence = {
      async getCaptionTrackCount() {
        return captionCount;
      },
      async getVideoTrackCount() {
        return 1;
      }
    };
    const project = {
      async getActiveSequence() {
        return sequence;
      },
      async getRootItem() {
        return root;
      },
      async importFiles(paths) {
        importedPaths.push(paths[0]);
        captionCount = 1;
        return true;
      },
      lockedAccess(fn) {
        fn();
      },
      executeTransaction(fn) {
        fn({
          addAction(action) {
            actions.push(action);
          }
        });
        return true;
      }
    };
    const ppro = {
      Project: {
        async getActiveProject() {
          return project;
        }
      },
      TickTime: {
        createWithSeconds(seconds) {
          return { seconds };
        }
      },
      SequenceEditor: {
        getEditor() {
          return {
            createInsertProjectItemAction(item, time, videoIndex) {
              return { type: "insert", itemName: item.name, videoIndex, time };
            }
          };
        }
      },
      FolderItem: {
        cast() {
          return null;
        }
      }
    };
    const uxp = {
      storage: {
        formats: { utf8: "utf8" },
        localFileSystem: {
          async getTemporaryFolder() {
            return {
              async createFile(name) {
                return {
                  name,
                  nativePath: `/tmp/${name}`,
                  async write(contents) {
                    written.push({ name, contents });
                  }
                };
              }
            };
          }
        }
      }
    };

    const result = await applyCaptions.addCaptionsToSequence(ppro, uxp, {}, {
      srt: "1\n00:00:00,000 --> 00:00:01,000\nHello\n",
      ttml: "<tt>Hello</tt>",
      cueCount: 1,
      presetName: "Clean Lower Third"
    });

    assert.equal(result.ok, true);
    assert.equal(result.inserted, true);
    assert.ok(written.length >= 1);
    assert.ok(importedPaths.length >= 1);
    assert.equal(actions[0].type, "insert");
    assert.equal(actions[0].itemName, "birdcut-captions-1.srt");
    assert.doesNotMatch(result.message, /deleted/i);
  });
});
