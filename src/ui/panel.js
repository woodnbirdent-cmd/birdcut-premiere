"use strict";

function load(name, globalName, requirePath) {
  if (typeof require === "function") {
    try {
      return require(requirePath);
    } catch (_err) {
      /* fall through for browser preview */
    }
  }
  return globalThis[globalName] || {};
}

const time = load("time", "BirdCutTime", "../core/time");
const model = load("model", "BirdCutTranscript", "../core/transcript-model");
const planner = load("planner", "BirdCutPlanner", "../core/cut-planner");
const captions = load("captions", "BirdCutCaptions", "../core/captions-srt");
const trimTools = load("trim", "BirdCutTrim", "../core/trim-tools");
const settingsApi = load("settings", "BirdCutSettings", "../core/settings");
const undoApi = load("undo", "BirdCutUndo", "../core/undo-stack");
const stt = load("stt", "BirdCutStt", "../stt/transcribe");
const applyCuts = load("apply", "BirdCutApply", "../premiere/apply-cuts");

function h(html) {
  return html;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function speakerColor(transcript, speakerId) {
  const speaker = (transcript.speakers || []).find((item) => item.id === speakerId);
  if (speaker && speaker.color) return speaker.color;
  if (speakerId === "s2") return "#6ee7b7";
  if (speakerId === "s3") return "#e8b86d";
  return "#7c9cff";
}

function createPanelController({ root, host, storage, secureStorage, fixture }) {
  const settingsStore = settingsApi.createSettingsStore(storage, secureStorage);
  const history = undoApi.createUndoStack({ limit: 80 });
  const state = {
    tab: "transcript",
    transcript: model.createEmptyTranscript(),
    selectedIds: [],
    anchorId: null,
    searchQuery: "",
    matchIds: [],
    matchIndex: -1,
    draft: null,
    settings: settingsApi.normalizeSettings(settingsApi.DEFAULT_SETTINGS),
    hostStatus: { message: "Connecting…", sequenceName: "", available: false },
    cutPlan: null,
    message: "",
    messageTone: "info",
    busy: false
  };

  function setMessage(message, tone) {
    state.message = message || "";
    state.messageTone = tone || "info";
  }

  function selectedSet() {
    return new Set(state.selectedIds);
  }

  function commitTranscript(next, { record } = { record: true }) {
    state.transcript = model.normalizeTranscript(next);
    if (record) history.push(state.transcript);
    refreshCutPlan();
  }

  function refreshCutPlan() {
    const snapshotItems = state.sequenceItems || [];
    state.cutPlan = planner.createRippleCutPlan(state.transcript, snapshotItems, {
      padMs: state.settings.padCutMs
    });
  }

  function wordById(id) {
    return state.transcript.words.find((word) => word.id === id);
  }

  function rangeSelect(fromId, toId) {
    const words = state.transcript.words;
    const a = words.findIndex((word) => word.id === fromId);
    const b = words.findIndex((word) => word.id === toId);
    if (a < 0 || b < 0) return [toId];
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    return words.slice(start, end + 1).map((word) => word.id);
  }

  async function refreshHost() {
    try {
      state.hostStatus = await host.getStatus();
      if (host.available && typeof host.getSequenceSnapshot === "function") {
        try {
          const snapshot = await host.getSequenceSnapshot();
          state.sequenceItems = snapshot.items || [];
          state.mediaPaths = snapshot.mediaPaths || [];
        } catch (_err) {
          state.sequenceItems = [];
        }
      }
    } catch (err) {
      state.hostStatus = { available: false, message: err.message || String(err) };
    }
    render();
  }

  async function transcribe() {
    state.busy = true;
    setMessage("Transcribing…", "info");
    render();
    try {
      let input = {};
      if (state.settings.sttProvider === "whisper" && typeof host.pickAudioFile === "function") {
        const picked = await host.pickAudioFile();
        if (!picked) {
          setMessage("Transcription cancelled — no file selected.", "warn");
          return;
        }
        if (picked.isJson) {
          const text = new TextDecoder("utf-8").decode(picked.audioBytes);
          commitTranscript(
            model.annotateFillers(
              model.insertSilenceMarkers(model.normalizeTranscript(JSON.parse(text)), {
                minGapMs: state.settings.silenceThresholdMs
              }),
              state.settings.fillerList
            )
          );
          history.reset(state.transcript);
          setMessage(`Loaded transcript JSON (${picked.fileName}).`, "ok");
          return;
        }
        input = picked;
      }
      const transcript = await stt.transcribeAudio(input, state.settings, {
        apiKey: settingsStore.getApiKey(),
        fixture
      });
      commitTranscript(transcript);
      history.reset(state.transcript);
      const status = state.hostStatus.sequenceName
        ? ` for ${state.hostStatus.sequenceName}`
        : "";
      setMessage(`Loaded ${transcript.words.length} words${status}.`, "ok");
    } catch (err) {
      setMessage(err.message || String(err), "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  function deleteSelection() {
    if (!state.selectedIds.length) {
      setMessage("Select words to delete.", "warn");
      render();
      return;
    }
    commitTranscript(model.setWordsDeleted(state.transcript, state.selectedIds, true));
    setMessage(`Deleted ${state.selectedIds.length} word(s) from the transcript.`, "ok");
    state.selectedIds = [];
    render();
  }

  function undo() {
    if (!history.canUndo()) return;
    state.transcript = history.undo();
    refreshCutPlan();
    setMessage("Undo.", "info");
    render();
  }

  function redo() {
    if (!history.canRedo()) return;
    state.transcript = history.redo();
    refreshCutPlan();
    setMessage("Redo.", "info");
    render();
  }

  function runSearch(query) {
    state.searchQuery = query;
    state.matchIds = model.searchWordIds(state.transcript, query);
    state.matchIndex = state.matchIds.length ? 0 : -1;
    render();
    scrollToWord(state.matchIds[0]);
  }

  function jumpMatch(delta) {
    if (!state.matchIds.length) return;
    state.matchIndex = (state.matchIndex + delta + state.matchIds.length) % state.matchIds.length;
    render();
    scrollToWord(state.matchIds[state.matchIndex]);
  }

  function scrollToWord(id) {
    if (!id || !root) return;
    const node = root.querySelector(`[data-word-id="${id}"]`);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: "center" });
  }

  function previewDraft(kind) {
    let result;
    if (kind === "silence") {
      result = trimTools.draftRemoveSilence(state.transcript, {
        minSilenceMs: state.settings.silenceThresholdMs
      });
    } else if (kind === "fillers") {
      result = trimTools.draftRemoveFillers(state.transcript, state.settings.fillerList);
    } else if (kind === "retakes") {
      result = trimTools.draftRemoveRetakes(state.transcript);
    } else if (kind === "shortform") {
      result = trimTools.draftShortformClips(state.transcript);
    }
    if (!result) return;
    if (result.transcript !== state.transcript && kind === "silence") {
      commitTranscript(result.transcript, { record: true });
    }
    state.draft = result.draft;
    setMessage(`${result.draft.note} Preview ${result.draft.summary.removedCount} items.`, "info");
    render();
  }

  function saveDraft() {
    if (!state.draft) return;
    commitTranscript(trimTools.applyDraftToTranscript(state.transcript, state.draft));
    setMessage(`Saved ${state.draft.tool} draft into the transcript. Apply to sequence when ready.`, "ok");
    state.draft = null;
    render();
  }

  function discardDraft() {
    state.draft = null;
    setMessage("Draft discarded.", "info");
    render();
  }

  async function applyToSequence() {
    refreshCutPlan();
    if (!state.cutPlan || !state.cutPlan.removeRanges.length) {
      setMessage("No deleted ranges to apply.", "warn");
      render();
      return;
    }
    state.busy = true;
    setMessage("Applying cut plan to the active sequence…", "info");
    render();
    try {
      if (typeof host.getSequenceSnapshot === "function" && host.available) {
        const snapshot = await host.getSequenceSnapshot();
        state.sequenceItems = snapshot.items || [];
        refreshCutPlan();
      }
      const result = await host.applyCutPlan(state.cutPlan, (ppro, plan, hostRef) =>
        applyCuts.applyCutPlanToSequence(ppro, plan, hostRef)
      );
      setMessage(result.message, result.ok ? "ok" : "error");
    } catch (err) {
      setMessage(err.message || String(err), "error");
    } finally {
      state.busy = false;
      render();
    }
  }

  async function exportSrt() {
    const srt = captions.transcriptToSrt(state.transcript, {
      includeSpeakers: state.settings.includeSpeakerInCaptions
    });
    if (!srt) {
      setMessage("Nothing to export. Transcribe first.", "warn");
      render();
      return;
    }
    if (typeof host.saveTextFile === "function") {
      const result = await host.saveTextFile("birdcut.srt", srt, ["srt"]);
      setMessage(result.message || (result.ok ? "Saved SRT." : "Save failed."), result.ok ? "ok" : "warn");
      if (!result.ok && typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(srt);
          setMessage("SRT copied to clipboard.", "ok");
        } catch (_err) {
          /* ignore */
        }
      }
    }
    render();
    return srt;
  }

  async function saveSettingsFromForm() {
    const form = root.querySelector("#settings-form");
    if (!form) return;
    const data = {
      language: form.querySelector("[name=language]").value,
      sttProvider: form.querySelector("[name=sttProvider]").value,
      whisperBaseUrl: form.querySelector("[name=whisperBaseUrl]").value,
      whisperModel: form.querySelector("[name=whisperModel]").value,
      fillerListText: form.querySelector("[name=fillerList]").value,
      textSize: form.querySelector("[name=textSize]").value,
      silenceThresholdMs: form.querySelector("[name=silenceThresholdMs]").value,
      padCutMs: form.querySelector("[name=padCutMs]").value,
      includeSpeakerInCaptions: form.querySelector("[name=includeSpeakerInCaptions]").checked
    };
    const apiKey = form.querySelector("[name=apiKey]").value.trim();
    if (apiKey) data.apiKey = apiKey;
    state.settings = await settingsStore.save(data);
    form.querySelector("[name=apiKey]").value = "";
    setMessage("Settings saved. API keys stay local — never committed.", "ok");
    render();
  }

  function renderTranscript() {
    const selected = selectedSet();
    const match = new Set(state.matchIds);
    const draftDeletes = new Set((state.draft && state.draft.wordIdsToDelete) || []);
    const clipWindows = (state.draft && state.draft.clipWindows) || [];
    let lastSpeaker = null;
    const parts = [];
    state.transcript.words.forEach((word) => {
      if (word.speakerId && word.speakerId !== lastSpeaker) {
        lastSpeaker = word.speakerId;
        const label = model.speakerLabel(state.transcript, word.speakerId);
        parts.push(
          `<span class="speaker-tag" style="--speaker:${speakerColor(state.transcript, word.speakerId)}">${escapeHtml(label)}</span>`
        );
      }
      const classes = ["word"];
      if (word.deleted) classes.push("is-deleted");
      if (word.isSilence) classes.push("is-silence");
      if (word.isFiller) classes.push("is-filler");
      if (selected.has(word.id)) classes.push("is-selected");
      if (match.has(word.id)) classes.push("is-match");
      if (draftDeletes.has(word.id)) classes.push("is-draft");
      if (clipWindows.some((window) => word.startMs < window.endMs && word.endMs > window.startMs)) {
        classes.push("is-clip");
      }
      const title = `${time.formatTimecode(word.startMs, { includeMs: true })}–${time.formatTimecode(word.endMs, { includeMs: true })}`;
      parts.push(
        `<button type="button" class="${classes.join(" ")}" data-word-id="${escapeHtml(word.id)}" title="${escapeHtml(title)}">${escapeHtml(word.text)}</button>`
      );
    });
    if (!parts.length) {
      return `<div class="empty">Load the demo transcript or transcribe the active sequence to start editing.</div>`;
    }
    return `<div class="transcript">${parts.join(" ")}</div>`;
  }

  function renderPlan() {
    if (!state.cutPlan) return "";
    const plan = state.cutPlan;
    const ranges = (plan.removeRanges || [])
      .map(
        (range) =>
          `<li><code>${time.formatTimecode(range.startMs, { includeMs: true })}</code> → <code>${time.formatTimecode(range.endMs, { includeMs: true })}</code> <span class="muted">${escapeHtml(range.reason)}</span></li>`
      )
      .join("");
    return h(`
      <div class="plan">
        <div class="plan-meta">
          <span>Remove ${time.formatCompactDuration(plan.totalRemovedMs)}</span>
          <span>Keep ${time.formatCompactDuration(plan.totalKeptMs)}</span>
          <span>${(plan.operations || []).length} edit ops</span>
        </div>
        <ul class="plan-list">${ranges || "<li class='muted'>No ranges marked for removal.</li>"}</ul>
      </div>
    `);
  }

  function renderTrim() {
    const draft = state.draft;
    const diff = trimTools.diffDraft(state.transcript, draft);
    const windows = (draft && draft.clipWindows) || [];
    return h(`
      <div class="trim-grid">
        <button type="button" class="tool" data-tool="silence"><strong>Remove silence</strong><span>Gaps ≥ ${state.settings.silenceThresholdMs}ms</span></button>
        <button type="button" class="tool" data-tool="fillers"><strong>Remove filler words</strong><span>${escapeHtml(state.settings.fillerList.slice(0, 4).join(", "))}…</span></button>
        <button type="button" class="tool" data-tool="retakes"><strong>Remove retakes</strong><span>Heuristic / stub — review the diff</span></button>
        <button type="button" class="tool" data-tool="shortform"><strong>Create shortform clips</strong><span>Keep densest chapters or windows</span></button>
      </div>
      <div class="draft">
        ${
          draft
            ? `<header><strong>${escapeHtml(draft.tool)}</strong> draft</header>
               <p>${escapeHtml(draft.note)}</p>
               <p>${draft.summary.removedCount} tokens · ${time.formatCompactDuration(draft.summary.removedMs)} · ${diff.addedDeletes.length} new deletes</p>
               ${windows.map((window) => `<div class="clip-window">${escapeHtml(window.title)} · ${time.formatTimecode(window.startMs, { includeMs: true })}–${time.formatTimecode(window.endMs, { includeMs: true })}</div>`).join("")}
               <div class="row">
                 <button type="button" class="btn primary" id="btn-save-draft">Save draft</button>
                 <button type="button" class="btn" id="btn-discard-draft">Discard</button>
               </div>`
            : `<p class="muted">Run a trim tool to preview a draft. Save it into the transcript, then Apply to sequence.</p>`
        }
      </div>
    `);
  }

  function renderCaptions() {
    const cues = captions.transcriptToCues(state.transcript, {
      includeSpeakers: state.settings.includeSpeakerInCaptions
    });
    const srt = captions.cuesToSrt(cues);
    const list = cues
      .map(
        (cue) =>
          `<article class="cue"><header>${time.formatSrtTime(cue.startMs)} → ${time.formatSrtTime(cue.endMs)}</header><pre>${escapeHtml(cue.text)}</pre></article>`
      )
      .join("");
    return h(`
      <div class="row">
        <button type="button" class="btn primary" id="btn-export-srt">Export SRT</button>
        <span class="muted">${cues.length} cues from active words</span>
      </div>
      <div class="cues">${list || "<p class='empty'>No caption cues yet.</p>"}</div>
      <textarea class="srt-preview" readonly>${escapeHtml(srt)}</textarea>
    `);
  }

  function renderSettings() {
    const s = state.settings;
    return h(`
      <form id="settings-form" class="settings">
        <label>Language
          <input name="language" value="${escapeHtml(s.language)}" />
        </label>
        <label>STT provider
          <select name="sttProvider">
            <option value="mock"${s.sttProvider === "mock" ? " selected" : ""}>Mock / demo transcript</option>
            <option value="whisper"${s.sttProvider === "whisper" ? " selected" : ""}>OpenAI Whisper-compatible HTTP</option>
          </select>
        </label>
        <label>Whisper base URL
          <input name="whisperBaseUrl" value="${escapeHtml(s.whisperBaseUrl)}" />
        </label>
        <label>Whisper model
          <input name="whisperModel" value="${escapeHtml(s.whisperModel)}" />
        </label>
        <label>API key (stored locally, never hardcoded)
          <input name="apiKey" type="password" placeholder="${escapeHtml(s.hasApiKey ? s.apiKeyPreview : "Paste key — or set BIRDCUT_STT_API_KEY")}" />
        </label>
        <label>Filler words (comma or newline)
          <textarea name="fillerList">${escapeHtml(s.fillerList.join("\n"))}</textarea>
        </label>
        <label>Text size
          <select name="textSize">
            <option value="sm"${s.textSize === "sm" ? " selected" : ""}>Small</option>
            <option value="md"${s.textSize === "md" ? " selected" : ""}>Medium</option>
            <option value="lg"${s.textSize === "lg" ? " selected" : ""}>Large</option>
          </select>
        </label>
        <label>Silence threshold (ms)
          <input name="silenceThresholdMs" type="number" min="120" value="${escapeHtml(s.silenceThresholdMs)}" />
        </label>
        <label>Cut padding (ms)
          <input name="padCutMs" type="number" min="0" value="${escapeHtml(s.padCutMs)}" />
        </label>
        <label class="check">
          <input name="includeSpeakerInCaptions" type="checkbox"${s.includeSpeakerInCaptions ? " checked" : ""} />
          Include speaker names in captions
        </label>
        <button type="submit" class="btn primary">Save settings</button>
      </form>
    `);
  }

  function render() {
    if (!root) return;
    const tab = state.tab;
    root.innerHTML = h(`
      <div class="app text-${escapeHtml(state.settings.textSize)}">
        <header class="topbar">
          <div class="brand">
            <span class="logo" aria-hidden="true"></span>
            <div>
              <h1>BirdCut</h1>
              <p class="sub">${escapeHtml(state.hostStatus.message || "Ready")}</p>
            </div>
          </div>
          <div class="top-actions">
            <button type="button" class="btn primary" id="btn-transcribe"${state.busy ? " disabled" : ""}>Transcribe</button>
            <button type="button" class="btn danger" id="btn-apply"${state.busy ? " disabled" : ""}>Apply to sequence</button>
          </div>
        </header>
        <nav class="tabs">
          <button type="button" class="tab${tab === "transcript" ? " active" : ""}" data-tab="transcript">Transcript</button>
          <button type="button" class="tab${tab === "trim" ? " active" : ""}" data-tab="trim">Trim</button>
          <button type="button" class="tab${tab === "captions" ? " active" : ""}" data-tab="captions">Captions</button>
          <button type="button" class="tab${tab === "settings" ? " active" : ""}" data-tab="settings">Settings</button>
        </nav>
        <section class="pane" data-pane="${tab}">
          ${
            tab === "transcript"
              ? `<div class="toolbar">
                   <input id="search" placeholder="Search transcript" value="${escapeHtml(state.searchQuery)}" />
                   <button type="button" class="btn" id="btn-prev-match">Prev</button>
                   <button type="button" class="btn" id="btn-next-match">Next</button>
                   <button type="button" class="btn" id="btn-delete">Delete</button>
                   <button type="button" class="btn" id="btn-undo"${history.canUndo() ? "" : " disabled"}>Undo</button>
                   <button type="button" class="btn" id="btn-redo"${history.canRedo() ? "" : " disabled"}>Redo</button>
                 </div>
                 ${renderTranscript()}
                 ${renderPlan()}`
              : ""
          }
          ${tab === "trim" ? renderTrim() : ""}
          ${tab === "captions" ? renderCaptions() : ""}
          ${tab === "settings" ? renderSettings() : ""}
        </section>
        <footer class="status status-${escapeHtml(state.messageTone)}">${escapeHtml(state.message || "Select words, delete to build a cut plan, then preview on Trim.")}</footer>
      </div>
    `);
    bind();
  }

  function bind() {
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.tab = button.getAttribute("data-tab");
        render();
      });
    });
    const transcribeBtn = root.querySelector("#btn-transcribe");
    if (transcribeBtn) transcribeBtn.addEventListener("click", () => transcribe());
    const applyBtn = root.querySelector("#btn-apply");
    if (applyBtn) applyBtn.addEventListener("click", () => applyToSequence());
    const search = root.querySelector("#search");
    if (search) {
      search.addEventListener("keydown", (event) => {
        if (event.key === "Enter") runSearch(search.value);
      });
      search.addEventListener("change", () => runSearch(search.value));
    }
    const prev = root.querySelector("#btn-prev-match");
    if (prev) prev.addEventListener("click", () => jumpMatch(-1));
    const next = root.querySelector("#btn-next-match");
    if (next) next.addEventListener("click", () => jumpMatch(1));
    const del = root.querySelector("#btn-delete");
    if (del) del.addEventListener("click", () => deleteSelection());
    const undoBtn = root.querySelector("#btn-undo");
    if (undoBtn) undoBtn.addEventListener("click", () => undo());
    const redoBtn = root.querySelector("#btn-redo");
    if (redoBtn) redoBtn.addEventListener("click", () => redo());
    root.querySelectorAll("[data-word-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        const id = button.getAttribute("data-word-id");
        const word = wordById(id);
        if (word && typeof host.setPlayerPosition === "function") {
          host.setPlayerPosition(word.startMs);
        }
        if (event.shiftKey && state.anchorId) {
          state.selectedIds = rangeSelect(state.anchorId, id);
        } else if (event.metaKey || event.ctrlKey) {
          const set = selectedSet();
          if (set.has(id)) set.delete(id);
          else set.add(id);
          state.selectedIds = Array.from(set);
          state.anchorId = id;
        } else {
          state.selectedIds = [id];
          state.anchorId = id;
        }
        render();
      });
    });
    root.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => previewDraft(button.getAttribute("data-tool")));
    });
    const saveDraftBtn = root.querySelector("#btn-save-draft");
    if (saveDraftBtn) saveDraftBtn.addEventListener("click", () => saveDraft());
    const discardDraftBtn = root.querySelector("#btn-discard-draft");
    if (discardDraftBtn) discardDraftBtn.addEventListener("click", () => discardDraft());
    const exportBtn = root.querySelector("#btn-export-srt");
    if (exportBtn) exportBtn.addEventListener("click", () => exportSrt());
    const form = root.querySelector("#settings-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        saveSettingsFromForm();
      });
    }
  }

  function onKeyDown(event) {
    const key = event.key;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if ((key === "Backspace" || key === "Delete") && state.tab === "transcript") {
      const tag = event.target && event.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      deleteSelection();
    }
  }

  return {
    async mount() {
      await settingsStore.load();
      state.settings = settingsStore.get();
      history.reset(state.transcript);
      render();
      await refreshHost();
      if (root && root.ownerDocument) {
        root.ownerDocument.addEventListener("keydown", onKeyDown);
      }
    },
    getState() {
      return state;
    },
    transcribe,
    deleteSelection,
    undo,
    redo,
    applyToSequence,
    exportSrt
  };
}

const api = { createPanelController };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutPanel = api;
}
