"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const planner = require("../src/core/cut-planner");
const model = require("../src/core/transcript-model");

describe("cut planner", () => {
  it("merges overlapping and padded ranges", () => {
    const merged = planner.mergeRanges(
      [
        { startMs: 1000, endMs: 1400, reason: "a" },
        { startMs: 1350, endMs: 1800, reason: "b" }
      ],
      { padMs: 50 }
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].startMs, 950);
    assert.equal(merged[0].endMs, 1850);
  });

  it("inverts remove ranges into keep ranges", () => {
    const keep = planner.invertRanges([{ startMs: 1000, endMs: 2000 }], 5000);
    assert.deepEqual(keep, [
      { startMs: 0, endMs: 1000 },
      { startMs: 2000, endMs: 5000 }
    ]);
  });

  it("builds remove ranges from deleted words", () => {
    const transcript = model.normalizeTranscript({
      durationMs: 4000,
      words: [
        { id: "a", text: "keep", startMs: 0, endMs: 400 },
        { id: "b", text: "nope", startMs: 400, endMs: 900, deleted: true },
        { id: "c", text: "also", startMs: 900, endMs: 1200, deleted: true },
        { id: "d", text: "end", startMs: 2000, endMs: 2400 }
      ]
    });
    const plan = planner.planCutsFromTranscript(transcript);
    assert.equal(plan.removeRanges.length, 1);
    assert.equal(plan.removeRanges[0].startMs, 400);
    assert.equal(plan.removeRanges[0].endMs, 1200);
    assert.equal(plan.totalRemovedMs, 800);
    assert.equal(plan.applyOrder[0].startMs, 400);
  });

  it("maps a fully covered clip to remove and a middle hole to cloneTrim", () => {
    const items = [
      {
        id: "v1",
        startMs: 0,
        endMs: 10000,
        inPointMs: 0,
        outPointMs: 10000,
        trackIndex: 0,
        mediaType: "video"
      },
      {
        id: "v2",
        startMs: 10000,
        endMs: 12000,
        inPointMs: 0,
        outPointMs: 2000,
        trackIndex: 0,
        mediaType: "video"
      }
    ];
    const plan = planner.planTrackEdits(items, [
      { startMs: 2000, endMs: 4000, reason: "deleted" },
      { startMs: 10000, endMs: 12000, reason: "deleted" }
    ]);
    const types = plan.operations.map((op) => `${op.type}:${op.itemId}`);
    assert.ok(types.includes("remove:v2"));
    assert.ok(types.some((type) => type.startsWith("cloneTrim:v1")));
    assert.ok(types.some((type) => type.startsWith("setOutPoint:v1")));
    const firstPiece = plan.targetClips.find((clip) => clip.sourceId === "v1" && clip.pieceIndex === 0);
    const secondPiece = plan.targetClips.find((clip) => clip.sourceId === "v1" && clip.pieceIndex === 1);
    assert.equal(firstPiece.endMs, 2000);
    assert.equal(secondPiece.startMs, 2000);
    assert.equal(secondPiece.inPointMs, 4000);
  });

  it("shifts later media through the time map", () => {
    assert.equal(planner.mapTimeThroughCuts(5000, [{ startMs: 1000, endMs: 2000 }]), 4000);
    assert.equal(planner.mapTimeThroughCuts(1500, [{ startMs: 1000, endMs: 2000 }]), 1000);
  });
});
