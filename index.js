"use strict";

const { createPanelController } = require("./src/ui/panel");
const { createPremiereHost } = require("./src/premiere/host");

let mounted = false;

function mountPanel() {
  if (mounted) return;
  const root = document.getElementById("app") || document.body;
  const host = createPremiereHost();
  const storage = typeof localStorage !== "undefined" ? localStorage : null;
  let secureStorage = null;
  try {
    const uxp = require("uxp");
    secureStorage = uxp.storage && uxp.storage.secureStorage;
  } catch (_err) {
    secureStorage = null;
  }
  const controller = createPanelController({
    root,
    host,
    storage,
    secureStorage
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
