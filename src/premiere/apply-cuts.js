"use strict";
(function (root) {
function secondsTick(ppro, ms) {
  return ppro.TickTime.createWithSeconds((Number(ms) || 0) / 1000);
}

function findNativeItem(snapshot, itemId) {
  const items = (snapshot && snapshot.nativeItems) || [];
  return items.find((item) => item.id === itemId) || null;
}

async function applyCutPlanToSequence(ppro, plan, host) {
  if (!ppro || !plan) {
    return { ok: false, applied: false, message: "Missing Premiere host or cut plan." };
  }
  if (!plan.operations || !plan.operations.length) {
    return {
      ok: true,
      applied: false,
      message:
        "Nothing to apply — no deleted ranges in the transcript. Apply cuts only removes marked words. Use Add captions to sequence for captions."
    };
  }

  let snapshot;
  try {
    snapshot = await host.getSequenceSnapshot();
  } catch (err) {
    return { ok: false, applied: false, message: err.message || String(err) };
  }

  const project = await ppro.Project.getActiveProject();
  const sequence = snapshot.sequence || (await project.getActiveSequence());
  const editor = ppro.SequenceEditor.getEditor(sequence);
  const warnings = [];
  let appliedCount = 0;

  const run = () => {
    const success = project.executeTransaction((compoundAction) => {
      plan.operations.forEach((op) => {
        const nativeWrap = findNativeItem(snapshot, op.itemId);
        const clip = nativeWrap && nativeWrap.native;
        if (!clip && op.type !== "remove") {
          warnings.push(`No native clip for ${op.itemId} (${op.type}).`);
          return;
        }
        try {
          if (op.type === "setInPoint" && clip.createSetInPointAction) {
            compoundAction.addAction(clip.createSetInPointAction(secondsTick(ppro, op.inPointMs)));
            appliedCount += 1;
          } else if (op.type === "setOutPoint" && clip.createSetOutPointAction) {
            compoundAction.addAction(clip.createSetOutPointAction(secondsTick(ppro, op.outPointMs)));
            appliedCount += 1;
          } else if (op.type === "setStart" && clip.createSetStartAction) {
            compoundAction.addAction(clip.createSetStartAction(secondsTick(ppro, op.startMs)));
            appliedCount += 1;
          } else if (op.type === "cloneTrim") {
            const offsetMs = op.timeOffsetMs || 0;
            const cloneAction = editor.createCloneTrackItemAction(
              clip,
              secondsTick(ppro, offsetMs),
              0,
              0,
              op.mediaType !== "audio",
              false
            );
            compoundAction.addAction(cloneAction);
            appliedCount += 1;
            warnings.push(
              `Cloned ${op.itemId} for a middle cut. Set in/out on the clone manually if Premiere does not expose the clone handle yet.`
            );
          } else if (op.type === "remove") {
            warnings.push(
              `Remove ${op.itemId}: select the clip and re-run Apply, or delete it after trims. UXP remove requires a TrackItemSelection.`
            );
          } else {
            warnings.push(`Unhandled operation ${op.type} for ${op.itemId}.`);
          }
        } catch (err) {
          warnings.push(`${op.type} ${op.itemId}: ${err.message || err}`);
        }
      });
    }, "BirdCut apply cut plan");
    return success;
  };

  try {
    let success = false;
    if (typeof project.lockedAccess === "function") {
      project.lockedAccess(() => {
        success = run();
      });
    } else {
      success = run();
    }
    return {
      ok: Boolean(success) || appliedCount > 0,
      applied: appliedCount > 0,
      appliedCount,
      warnings,
      message:
        appliedCount > 0
          ? `Applied ${appliedCount} Premiere action(s). ${warnings.length ? "Review warnings." : "Save and inspect the timeline."}`
          : `No Premiere actions were committed. ${warnings[0] || "See docs/premiere-api-limits.md."}`
    };
  } catch (err) {
    return {
      ok: false,
      applied: false,
      appliedCount,
      warnings,
      message: err.message || String(err)
    };
  }
}

const api = { applyCutPlanToSequence, secondsTick };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutApply = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
