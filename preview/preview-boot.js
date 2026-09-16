"use strict";

async function bootPreview() {
  const fixture = await fetch("../fixtures/sample-transcript.json").then((response) => response.json());
  globalThis.BirdCutSampleTranscript = fixture;
  const host = {
    available: true,
    async getStatus() {
      return {
        available: true,
        projectName: "Preview",
        sequenceName: "Demo Sequence",
        durationMs: fixture.durationMs,
        message: "Preview mode — Premiere APIs mocked"
      };
    },
    async getSequenceSnapshot() {
      return {
        sequenceName: "Demo Sequence",
        durationMs: fixture.durationMs,
        items: [
          {
            id: "video:0:0:A-roll",
            name: "A-roll",
            startMs: 0,
            endMs: fixture.durationMs,
            inPointMs: 0,
            outPointMs: fixture.durationMs,
            trackIndex: 0,
            mediaType: "video"
          },
          {
            id: "audio:0:0:A-roll",
            name: "A-roll",
            startMs: 0,
            endMs: fixture.durationMs,
            inPointMs: 0,
            outPointMs: fixture.durationMs,
            trackIndex: 0,
            mediaType: "audio"
          }
        ],
        mediaPaths: []
      };
    },
    async applyCutPlan(plan) {
      const ranges = (plan && plan.removeRanges) || [];
      const ops = (plan && plan.operations) || [];
      return {
        ok: true,
        applied: false,
        message: `Preview: ${ops.length} ops, ${ranges.length} ranges (not sent to Premiere).`
      };
    },
    async captureAudio({ source, onProgress }) {
      if (typeof onProgress === "function") {
        onProgress({
          stage: "exporting",
          message: `Preview cannot bounce Premiere audio (${source}).`
        });
      }
      throw new Error(
        "Preview cannot bounce Premiere audio. Load BirdCut in Premiere 26, or use Mock / demo transcript."
      );
    },
    async pickPresetFile() {
      return null;
    },
    async saveTextFile(_name, contents) {
      try {
        await navigator.clipboard.writeText(contents);
        return { ok: true, message: "SRT copied to clipboard (preview has no file picker)." };
      } catch (_err) {
        return { ok: false, message: "Copy the SRT from the captions pane." };
      }
    },
    async setPlayerPosition() {
      return false;
    }
  };

  const controller = globalThis.BirdCutPanel.createPanelController({
    root: document.getElementById("app"),
    host,
    storage: window.localStorage,
    fixture
  });
  await controller.mount();
}

bootPreview().catch((err) => {
  document.body.textContent = err.message || String(err);
});
