"use strict";
(function (root) {
function itemName(item) {
  if (!item) return "";
  if (typeof item.name === "string" && item.name) return item.name;
  if (typeof item.getName === "function") {
    try {
      const value = item.getName();
      return value && typeof value.then === "function" ? "" : String(value || "");
    } catch (_err) {
      return "";
    }
  }
  return "";
}

function itemKey(item, index) {
  if (!item) return `missing:${index}`;
  if (item.guid) return String(item.guid);
  if (item.id != null) return String(item.id);
  return `${itemName(item)}:${index}`;
}

function findImportedItem(beforeKeys, afterItems, fileName) {
  const items = afterItems || [];
  const before = beforeKeys instanceof Set ? beforeKeys : new Set(beforeKeys || []);
  const base = String(fileName || "").split(/[/\\]/).pop();
  const stem = base.replace(/\.[^.]+$/, "");
  const newcomers = items.filter((item, index) => !before.has(itemKey(item, index)));
  const matchName = (item) => {
    const name = itemName(item);
    return name === base || name === stem || (stem && name.indexOf(stem) >= 0);
  };
  return newcomers.find(matchName) || items.find(matchName) || newcomers[0] || null;
}

function chooseInsertTrackIndexes({ videoCount, captionCount } = {}) {
  const videos = Math.max(0, Number(videoCount) || 0);
  const captions = Math.max(0, Number(captionCount) || 0);
  return {
    videoTrackIndex: videos,
    audioTrackIndex: 0,
    expectedCaptionIndex: captions
  };
}

function captionStyleNote({ fileName, styleHint, uppercase } = {}) {
  const name = String(fileName || "");
  const isTtml = /\.ttml$/i.test(name);
  const bits = [];
  if (isTtml) {
    bits.push(
      "Styled TTML was imported (font/color/outline in the file). If the timeline still looks like default white captions, Premiere stripped those styles — open the .ttml in the Project panel."
    );
  } else if (/\.srt$/i.test(name)) {
    bits.push(
      "Premiere’s SRT importer usually ignores font/color and uses its default caption look. Cue timing (and ALL CAPS, if on) is still in the letters."
    );
  }
  if (uppercase) bits.push("Cue text is ALL CAPS.");
  if (styleHint) bits.push(String(styleHint));
  return bits.join(" ");
}

function summarizeCaptionApply({
  imported,
  inserted,
  captionCountBefore,
  captionCountAfter,
  cueCount,
  presetName,
  fileName,
  warnings,
  styleHint,
  uppercase
} = {}) {
  const warns = warnings || [];
  const captionDelta = (Number(captionCountAfter) || 0) - (Number(captionCountBefore) || 0);
  const styleNote = captionStyleNote({ fileName, styleHint, uppercase });
  if (inserted && captionDelta > 0) {
    return {
      ok: true,
      applied: true,
      placed: "caption-track",
      message: `Added ${cueCount || 0} caption cue(s) to the sequence (${presetName || "preset"}). ${styleNote} Save and inspect the caption track.`
        .replace(/\s+/g, " ")
        .trim()
    };
  }
  if (inserted) {
    return {
      ok: true,
      applied: true,
      placed: "sequence",
      message: `Inserted ${fileName || "captions"} on the sequence (${presetName || "preset"}, ${cueCount || 0} cues). Premiere UXP has no createCaptionTrack helper — confirm the clip landed on a caption or video track. ${styleNote}`
        .replace(/\s+/g, " ")
        .trim()
    };
  }
  if (imported) {
    return {
      ok: true,
      applied: false,
      placed: "project-bin",
      message: `Imported ${fileName || "captions"} into the Project panel (${presetName || "preset"}). Premiere UXP cannot create a caption track yet — drag the .ttml (styled) or .srt onto the sequence. ${styleNote} ${warns[0] || ""}`
        .replace(/\s+/g, " ")
        .trim()
    };
  }
  return {
    ok: false,
    applied: false,
    placed: "none",
    message: warns[0] || "Could not import captions into Premiere."
  };
}

async function collectFolderItems(folder, ppro, acc) {
  if (!folder || typeof folder.getItems !== "function") return acc;
  let items = [];
  try {
    items = (await folder.getItems()) || [];
  } catch (_err) {
    return acc;
  }
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    acc.push(item);
    let nested = null;
    try {
      nested = ppro && ppro.FolderItem && typeof ppro.FolderItem.cast === "function" ? ppro.FolderItem.cast(item) : null;
    } catch (_err) {
      nested = null;
    }
    if (nested && typeof nested.getItems === "function") {
      await collectFolderItems(nested, ppro, acc);
    }
  }
  return acc;
}

async function writeTempFile(uxp, fileName, contents) {
  const fs = uxp && uxp.storage && uxp.storage.localFileSystem;
  if (!fs || typeof fs.getTemporaryFolder !== "function") {
    throw new Error("UXP temp folder is unavailable; cannot write captions for import.");
  }
  const folder = await fs.getTemporaryFolder();
  const file = await folder.createFile(fileName, { overwrite: true });
  const formats = (uxp.storage && uxp.storage.formats) || {};
  if (formats.utf8) await file.write(contents, { format: formats.utf8 });
  else await file.write(contents);
  return {
    file,
    name: file.name || fileName,
    path: file.nativePath || fileName
  };
}

function tickZero(ppro) {
  if (ppro.TickTime && ppro.TickTime.TIME_ZERO) return ppro.TickTime.TIME_ZERO;
  if (ppro.TickTime && typeof ppro.TickTime.createWithSeconds === "function") {
    return ppro.TickTime.createWithSeconds(0);
  }
  return 0;
}

async function importCaptionFile(project, path, targetBin) {
  if (!project || typeof project.importFiles !== "function") {
    throw new Error("project.importFiles is not available in this Premiere build.");
  }
  try {
    return await project.importFiles([path], true, targetBin, false);
  } catch (_err) {
    try {
      return await project.importFiles([path], targetBin, false);
    } catch (_err2) {
      return project.importFiles([path]);
    }
  }
}

function runLocked(project, fn) {
  if (project && typeof project.lockedAccess === "function") {
    let result;
    project.lockedAccess(() => {
      result = fn();
    });
    return result;
  }
  return fn();
}

function insertProjectItem(project, editor, item, ppro, indexes) {
  if (!editor || typeof editor.createInsertProjectItemAction !== "function") {
    throw new Error("SequenceEditor.createInsertProjectItemAction is not available.");
  }
  const time = tickZero(ppro);
  return runLocked(project, () =>
    project.executeTransaction((compoundAction) => {
      const action = editor.createInsertProjectItemAction(
        item,
        time,
        indexes.videoTrackIndex,
        indexes.audioTrackIndex,
        true
      );
      compoundAction.addAction(action);
    }, "BirdCut add captions")
  );
}

function overwriteProjectItem(project, editor, item, ppro, indexes) {
  if (!editor || typeof editor.createOverwriteItemAction !== "function") return false;
  const time = tickZero(ppro);
  return runLocked(project, () =>
    project.executeTransaction((compoundAction) => {
      const action = editor.createOverwriteItemAction(
        item,
        time,
        indexes.videoTrackIndex,
        indexes.audioTrackIndex
      );
      compoundAction.addAction(action);
    }, "BirdCut overwrite captions")
  );
}

async function findByMediaPath(ppro, root, mediaPath) {
  if (!ppro || !ppro.ClipProjectItem) return null;
  const items = await collectFolderItems(root, ppro, []);
  for (let i = 0; i < items.length; i += 1) {
    let clip = null;
    try {
      clip = ppro.ClipProjectItem.cast(items[i]);
    } catch (_err) {
      clip = null;
    }
    if (!clip || typeof clip.findItemsMatchingMediaPath !== "function") continue;
    try {
      const matches = (await clip.findItemsMatchingMediaPath(mediaPath, true)) || [];
      if (matches.length) return matches[0];
    } catch (_err) {
      /* keep looking */
    }
  }
  return null;
}

async function addCaptionsToSequence(ppro, uxp, host, payload) {
  const warnings = [];
  if (!ppro || !ppro.Project) {
    return { ok: false, applied: false, warnings, message: "Premiere host is not available." };
  }
  const srt = payload && payload.srt;
  const ttml = payload && payload.ttml;
  if (!srt && !ttml) {
    return { ok: false, applied: false, warnings, message: "Nothing to add — transcribe first." };
  }

  let project;
  let sequence;
  try {
    project = await ppro.Project.getActiveProject();
    sequence = project && (await project.getActiveSequence());
  } catch (err) {
    return { ok: false, applied: false, warnings, message: err.message || String(err) };
  }
  if (!project || !sequence) {
    return { ok: false, applied: false, warnings, message: "No active sequence. Open a sequence, then add captions." };
  }

  const stamp = Date.now();
  const files = [];
  try {
    if (ttml) files.push(await writeTempFile(uxp, `birdcut-captions-${stamp}.ttml`, ttml));
    if (srt) files.push(await writeTempFile(uxp, `birdcut-captions-${stamp}.srt`, srt));
  } catch (err) {
    return { ok: false, applied: false, warnings, message: err.message || String(err) };
  }

  let captionCountBefore = 0;
  let videoCount = 0;
  try {
    captionCountBefore = (await sequence.getCaptionTrackCount()) || 0;
  } catch (_err) {
    captionCountBefore = 0;
  }
  try {
    videoCount = (await sequence.getVideoTrackCount()) || 0;
  } catch (_err) {
    videoCount = 0;
  }

  const root = await project.getRootItem();
  const beforeItems = await collectFolderItems(root, ppro, []);
  const beforeKeys = new Set(beforeItems.map((item, index) => itemKey(item, index)));

  let importedItem = null;
  let usedFile = files[0];
  const importOrder = files.slice();
  for (let i = 0; i < importOrder.length; i += 1) {
    const file = importOrder[i];
    try {
      await importCaptionFile(project, file.path, root);
      const afterItems = await collectFolderItems(root, ppro, []);
      importedItem = findImportedItem(beforeKeys, afterItems, file.name);
      if (!importedItem) {
        importedItem = await findByMediaPath(ppro, root, file.path);
      }
      if (importedItem) {
        usedFile = file;
        break;
      }
      warnings.push(`Imported ${file.name} but could not resolve the ProjectItem.`);
    } catch (err) {
      warnings.push(`${file.name}: ${err.message || err}`);
    }
  }

  let inserted = false;
  if (importedItem) {
    const editor =
      ppro.SequenceEditor && typeof ppro.SequenceEditor.getEditor === "function"
        ? ppro.SequenceEditor.getEditor(sequence)
        : null;
    const indexes = chooseInsertTrackIndexes({ videoCount, captionCount: captionCountBefore });
    try {
      inserted = Boolean(insertProjectItem(project, editor, importedItem, ppro, indexes));
    } catch (err) {
      warnings.push(`Insert failed: ${err.message || err}`);
      try {
        inserted = Boolean(overwriteProjectItem(project, editor, importedItem, ppro, indexes));
      } catch (err2) {
        warnings.push(`Overwrite failed: ${err2.message || err2}`);
      }
    }
  }

  let captionCountAfter = captionCountBefore;
  try {
    captionCountAfter = (await sequence.getCaptionTrackCount()) || captionCountBefore;
  } catch (_err) {
    captionCountAfter = captionCountBefore;
  }

  const summary = summarizeCaptionApply({
    imported: Boolean(importedItem),
    inserted,
    captionCountBefore,
    captionCountAfter,
    cueCount: payload && payload.cueCount,
    presetName: payload && payload.presetName,
    fileName: usedFile && usedFile.name,
    warnings,
    styleHint: payload && payload.styleHint,
    uppercase: payload && payload.uppercase
  });
  return {
    ...summary,
    warnings,
    imported: Boolean(importedItem),
    inserted,
    captionCountBefore,
    captionCountAfter,
    fileName: usedFile && usedFile.name,
    filePath: usedFile && usedFile.path
  };
}

const api = {
  itemName,
  itemKey,
  findImportedItem,
  chooseInsertTrackIndexes,
  captionStyleNote,
  summarizeCaptionApply,
  addCaptionsToSequence
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutApplyCaptions = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
