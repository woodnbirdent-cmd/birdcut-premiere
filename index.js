"use strict";

const { createPanelController } = require("./src/ui/panel");
const { createPremiereHost } = require("./src/premiere/host");
const settingsApi = require("./src/core/settings");
require("./src/core/caption-styles");
require("./src/core/captions-srt");

let mounted = false;

function resolveStorage() {
  try {
    const uxp = require("uxp");
    if (uxp.storage && uxp.storage.localStorage && typeof uxp.storage.localStorage.getItem === "function") {
      return uxp.storage.localStorage;
    }
  } catch (_err) {
    /* preview / Node */
  }
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function resolveSecureStorage() {
  try {
    const uxp = require("uxp");
    return (uxp.storage && uxp.storage.secureStorage) || null;
  } catch (_err) {
    return null;
  }
}

function resolveFileStore() {
  try {
    const uxp = require("uxp");
    return settingsApi.createPluginFileStore(uxp.storage);
  } catch (_err) {
    return null;
  }
}

function mountPanel() {
  if (mounted) return;
  const root = document.getElementById("app") || document.body;
  const host = createPremiereHost();
  const controller = createPanelController({
    root,
    host,
    storage: resolveStorage(),
    secureStorage: resolveSecureStorage(),
    fileStore: resolveFileStore()
  });
  mounted = true;
  controller.mount();
}

try {
  const { entrypoints } = require("uxp");
  entrypoints.setup({
    plugin: {
      create() {},
      destroy() {}
    },
    panels: {
      birdcut: {
        create() {},
        show() {
          mountPanel();
        },
        hide() {},
        destroy() {}
      }
    }
  });
} catch (_err) {
  /* Preview / Node: no UXP entrypoints */
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountPanel);
  } else {
    mountPanel();
  }
}
