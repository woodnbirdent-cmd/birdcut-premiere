"use strict";
(function (root) {
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
const modelErrors = load("errors", "BirdCutErrors", "../stt/errors");

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

function fieldValue(form, name) {
  if (!form || typeof form.querySelector !== "function") return null;
  return form.querySelector(`[name="${name}"]`) || form.querySelector(`[name=${name}]`);
}

function readSettingsFromForm(form) {
  if (!form) return null;
  const language = fieldValue(form, "language");
  const sttProvider = fieldValue(form, "sttProvider");
  if (!language && !sttProvider) return null;
  const valueOf = (name) => {
    const field = fieldValue(form, name);
    return field ? field.value : undefined;
  };
  const includeSpeaker = fieldValue(form, "includeSpeakerInCaptions");
  const apiKeyField = fieldValue(form, "apiKey");
  const data = {
    language: language ? language.value : undefined,
    sttProvider: sttProvider ? sttProvider.value : undefined,
    whisperBaseUrl: valueOf("whisperBaseUrl"),
    whisperModel: valueOf("whisperModel"),
    fillerListText: valueOf("fillerList"),
    textSize: valueOf("textSize"),
    silenceThresholdMs: valueOf("silenceThresholdMs"),
    padCutMs: valueOf("padCutMs"),
    includeSpeakerInCaptions: includeSpeaker ? Boolean(includeSpeaker.checked) : undefined,
    transcribeSource: valueOf("transcribeSource"),
    audioPresetPath: valueOf("audioPresetPath")
  };
  Object.keys(data).forEach((key) => {
    if (data[key] === undefined) delete data[key];
  });
  if (apiKeyField && String(apiKeyField.value || "").trim()) {
    data.apiKey = String(apiKeyField.value).trim();
  }
  return data;
}

let uxpHost = null;
try {
  uxpHost = typeof require === "function" ? require("uxp") : null;
} catch (_err) {
  uxpHost = null;
}

function createPanelController({ root, host, storage, secureStorage, fileStore, fixture }) {
  const settingsStore = settingsApi.createSettingsStore(storage, secureStorage, fileStore);
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
    adobeLanguages: [],
    cutPlan: null,
    message: "",
    messageTone: "info",
    busy: false,
    progressStage: ""
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
      if (host.available && typeof host.queryAdobeLanguages === "function") {
        try {
          state.adobeLanguages = (await host.queryAdobeLanguages()) || [];
        } catch (_err) {
          state.adobeLanguages = [];
        }
      }
    } catch (err) {
      state.hostStatus = { available: false, message: err.message || String(err) };
    }
    render();
  }

  async function transcribe(sourceOverride) {
    const provider = state.settings.sttProvider;
    const source =
      sourceOverride ||
      (provider === "mock" ? "mock" : state.settings.transcribeSource || "sequence");
    state.busy = true;
    state.progressStage = "starting";
    setMessage(
      provider === "mock"
        ? "Loading demo transcript…"
        : provider === "adobe"
          ? source === "import"
            ? "Importing Premiere transcript…"
            : "Starting Adobe Speech to Text…"
          : "Preparing audio…",
      "info"
    );
    render();
    const onProgress = ({ stage, message }) => {
      state.progressStage = stage || "";
      setMessage(message || "Working…", "info");
      render();
    };
    try {
      if (provider === "mock") {
        const transcript = await stt.transcribeAudio({}, state.settings, {
          fixture,
          onProgress
        });
        commitTranscript(transcript);
        history.reset(state.transcript);
        setMessage(
          `Loaded ${transcript.words.length} demo words (mock). Switch Settings → Adobe native or Whisper to transcribe the timeline.`,
          "ok"
        );
        return;
      }

      if (provider === "adobe") {
        const transcript = await stt.transcribeAudio({ source }, state.settings, {
          captureAdobe:
            typeof host.transcribeAdobe === "function"
              ? (opts) => host.transcribeAdobe(opts)
              : null,
          onProgress
        });
        commitTranscript(transcript);
        history.reset(state.transcript);
        setMessage(
          source === "import"
            ? `Imported ${transcript.words.length} words from Premiere transcript (${transcript.source && transcript.source.label ? transcript.source.label : "clip"}).`
            : `Loaded ${transcript.words.length} words from Adobe Speech to Text (${transcript.source && transcript.source.label ? transcript.source.label : source}).`,
          "ok"
        );
        return;
      }

      if (!settingsStore.getApiKey()) {
        throw new Error("Missing STT API key. Set it in Settings or BIRDCUT_STT_API_KEY.");
      }

      let input = null;
      if (source === "file") {
        if (typeof host.pickAudioFile !== "function") {
          throw new Error("File picker is not available.");
        }
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
      } else if (typeof host.captureAudio === "function") {
        input = await host.captureAudio({
          source: source === "clip" ? "clip" : "sequence",
          presetPath: state.settings.audioPresetPath,
          onProgress
        });
      } else {
        throw new Error("This host cannot capture sequence audio. Use Transcribe inside Premiere.");
      }

      const transcript = await stt.transcribeAudio(input, state.settings, {
        apiKey: settingsStore.getApiKey(),
        onProgress
      });
      commitTranscript(transcript);
      history.reset(state.transcript);
      const where = (input && input.alignment && input.alignment.label) || state.hostStatus.sequenceName || source;
      setMessage(`Loaded ${transcript.words.length} words from ${where}.`, "ok");
    } catch (err) {
      const explained =
        modelErrors.explainSttError &&
        modelErrors.explainSttError(err, {
          baseUrl: state.settings.whisperBaseUrl,
          source
        });
      setMessage(explained || err.message || String(err), "error");
    } finally {
      state.busy = false;
      state.progressStage = "";
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

  function flushFormIntoState() {
    const form = root && root.querySelector ? root.querySelector("#settings-form") : null;
    const data = readSettingsFromForm(form);
    if (!data) return null;
    settingsStore.save(data);
    state.settings = settingsStore.get();
    return data;
  }

  async function persistFormSettings({ rerender, message, tone } = {}) {
    const data = flushFormIntoState();
    if (!data) return state.settings;
    state.settings = await settingsStore.save(data);
    if (message) setMessage(message, tone || "ok");
    if (rerender) render();
    return state.settings;
  }

  async function saveSettingsFromForm() {
    const form = root.querySelector("#settings-form");
    if (!form) return;
    const data = readSettingsFromForm(form) || {};
    state.settings = await settingsStore.save(data);
    const apiKeyField = fieldValue(form, "apiKey");
    if (apiKeyField) apiKeyField.value = "";
    setMessage("Settings saved. API keys stay local — never committed.", "ok");
    render();
  }

  async function saveSettings(partial) {
    const form = root && root.querySelector ? root.querySelector("#settings-form") : null;
    const fromForm = readSettingsFromForm(form) || {};
    state.settings = await settingsStore.save({ ...fromForm, ...(partial || {}) });
    render();
    return state.settings;
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
    const packs = state.adobeLanguages || [];
    let selectedPack = "";
    if (packs.length) {
      const fold = (value) => String(value || "").toLowerCase();
      const current = fold(s.language);
      const exact = packs.find(
        (pack) => fold(pack.languageCode) === current || fold(pack.locale) === current
      );
      const prefix = packs.find((pack) => fold(pack.languageCode).split("-")[0] === current.split("-")[0]);
      selectedPack = (exact || prefix || packs[0]).languageCode;
    }
    const packNote = packs.length
      ? packs
          .map((pack) => {
            const mark = pack.packAvailable === true ? " (on-device)" : pack.packAvailable === false ? " (cloud)" : "";
            return `${pack.displayString || pack.languageCode}${mark}`;
          })
          .join(", ")
      : "";
    const languageField =
      s.sttProvider === "adobe" && packs.length
        ? `<label>Language (Adobe Speech to Text)
            <select name="language">
              ${packs
                .map(
                  (pack) =>
                    `<option value="${escapeHtml(pack.languageCode)}"${
                      pack.languageCode === selectedPack ? " selected" : ""
                    }>${escapeHtml(pack.displayString || pack.languageCode)}</option>`
                )
                .join("")}
            </select>
          </label>`
        : `<label>Language
            <input name="language" value="${escapeHtml(s.language)}" />
          </label>`;
    return h(`
      <form id="settings-form" class="settings">
        ${languageField}
        <label>STT provider
          <select name="sttProvider">
            <option value="mock"${s.sttProvider === "mock" ? " selected" : ""}>Mock / demo transcript (ignores timeline)</option>
            <option value="adobe"${s.sttProvider === "adobe" ? " selected" : ""}>Adobe Premiere Speech to Text / native</option>
            <option value="whisper"${s.sttProvider === "whisper" ? " selected" : ""}>OpenAI Whisper-compatible HTTP</option>
          </select>
        </label>
        ${
          s.sttProvider === "adobe"
            ? `<p class="muted">Uses Premiere’s Speech to Text on each source clip. No OpenAI key. Prefer selecting a ClipProjectItem in the Project panel (not a nested sequence). If Premiere already transcribed the clip (Window → Text), use <strong>Import Premiere transcript</strong> — that only runs exportToJSON. On-device packs stay local; Adobe cloud languages may still use Adobe credits. ${
                packNote ? `Available: ${escapeHtml(packNote)}.` : "Install language packs in Premiere: Window → Text."
              }</p>`
            : ""
        }
        <label>Whisper base URL
          <input name="whisperBaseUrl" value="${escapeHtml(s.whisperBaseUrl)}" />
        </label>
        <label>Whisper model
          <input name="whisperModel" value="${escapeHtml(s.whisperModel)}" />
        </label>
        <label>Transcribe target
          <select name="transcribeSource">
            <option value="sequence"${s.transcribeSource !== "clip" ? " selected" : ""}>Active sequence</option>
            <option value="clip"${s.transcribeSource === "clip" ? " selected" : ""}>Selected clip(s)</option>
          </select>
        </label>
        <label>Audio-only .epr preset (optional, Whisper bounce)
          <input name="audioPresetPath" value="${escapeHtml(s.audioPresetPath)}" placeholder="Path to MP3 or WAV preset" />
        </label>
        <button type="button" class="btn" id="btn-pick-preset">Choose .epr…</button>
        <label>API key (Whisper only — stored locally, never hardcoded)
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
        <p class="muted">Provider and other options save as you change them. Use Save settings after pasting an API key.</p>
        <button type="submit" class="btn primary">Save settings</button>
      </form>
    `);
  }

  function render() {
    if (!root) return;
    const paneEl = root.querySelector ? root.querySelector(".pane") : null;
    const prevPane = paneEl && paneEl.getAttribute ? paneEl.getAttribute("data-pane") : "";
    const scrollTop = paneEl && prevPane === state.tab ? Number(paneEl.scrollTop) || 0 : 0;
    flushFormIntoState();
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
            ${
              state.settings.sttProvider === "whisper" || state.settings.sttProvider === "adobe"
                ? `<button type="button" class="btn primary" id="btn-transcribe-sequence"${state.busy ? " disabled" : ""}>Transcribe sequence</button>
                   <button type="button" class="btn" id="btn-transcribe-clip"${state.busy ? " disabled" : ""}>Clip</button>
                   ${
                     state.settings.sttProvider === "whisper"
                       ? `<button type="button" class="btn" id="btn-transcribe-file"${state.busy ? " disabled" : ""}>Pick file</button>`
                       : `<button type="button" class="btn" id="btn-import-premiere"${state.busy ? " disabled" : ""}>Import Premiere transcript</button>`
                   }`
                : `<button type="button" class="btn primary" id="btn-transcribe"${state.busy ? " disabled" : ""}>Transcribe</button>`
            }
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
    const nextPane = root.querySelector ? root.querySelector(".pane") : null;
    if (nextPane) nextPane.scrollTop = scrollTop;
  }

  function bind() {
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", async () => {
        await persistFormSettings({ rerender: false });
        state.tab = button.getAttribute("data-tab");
        render();
      });
    });
    const transcribeBtn = root.querySelector("#btn-transcribe");
    if (transcribeBtn) transcribeBtn.addEventListener("click", () => transcribe());
    const transcribeSeq = root.querySelector("#btn-transcribe-sequence");
    if (transcribeSeq) transcribeSeq.addEventListener("click", () => transcribe("sequence"));
    const transcribeClip = root.querySelector("#btn-transcribe-clip");
    if (transcribeClip) transcribeClip.addEventListener("click", () => transcribe("clip"));
    const importPremiere = root.querySelector("#btn-import-premiere");
    if (importPremiere) importPremiere.addEventListener("click", () => transcribe("import"));
    const transcribeFile = root.querySelector("#btn-transcribe-file");
    if (transcribeFile) transcribeFile.addEventListener("click", () => transcribe("file"));
    const pickPreset = root.querySelector("#btn-pick-preset");
    if (pickPreset) {
      pickPreset.addEventListener("click", async () => {
        if (typeof host.pickPresetFile !== "function") return;
        const path = await host.pickPresetFile();
        if (!path) return;
        const form = root.querySelector("#settings-form");
        const presetField = form && fieldValue(form, "audioPresetPath");
        if (presetField) presetField.value = path;
        const fromForm = readSettingsFromForm(form) || {};
        state.settings = await settingsStore.save({ ...fromForm, audioPresetPath: path });
        setMessage(`Using preset ${path.split(/[/\\]/).pop()}.`, "ok");
        render();
      });
    }
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
      const persistFromControl = async (control) => {
        const name = control && (control.name || (control.getAttribute && control.getAttribute("name"))) || "";
        const fromForm = readSettingsFromForm(form) || {};
        if (name === "sttProvider" && control && control.value) {
          fromForm.sttProvider = control.value;
        }
        const prevProvider = state.settings.sttProvider;
        const prevSize = state.settings.textSize;
        state.settings = await settingsStore.save(fromForm);
        const providerChanged = state.settings.sttProvider !== prevProvider;
        const sizeChanged = state.settings.textSize !== prevSize;
        if (providerChanged) setMessage("STT provider saved.", "ok");
        if (providerChanged || sizeChanged) render();
      };
      form.addEventListener("change", (event) => {
        persistFromControl(event.target);
      });
      const providerSelect = fieldValue(form, "sttProvider");
      if (providerSelect) {
        providerSelect.addEventListener("change", () => persistFromControl(providerSelect));
        providerSelect.addEventListener("input", () => persistFromControl(providerSelect));
      }
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

  function onWheel(event) {
    const dy = event.deltaY;
    if (!dy) return;
    const pane = root.querySelector ? root.querySelector(".pane") : null;
    if (pane && pane.scrollHeight > pane.clientHeight + 1) {
      pane.scrollTop += dy;
      return;
    }
    const doc = (root && root.ownerDocument) || (typeof document !== "undefined" ? document : null);
    if (!doc) return;
    const scroller = doc.scrollingElement || doc.documentElement || doc.body;
    if (scroller) scroller.scrollTop += dy;
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
        if (uxpHost) {
          root.addEventListener("wheel", onWheel, { passive: true });
        }
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
    exportSrt,
    saveSettings,
    persistFormSettings,
    readSettingsFromForm
  };
}

const api = { createPanelController, readSettingsFromForm };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutPanel = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
