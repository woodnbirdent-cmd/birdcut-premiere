"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("panel scroll structure", () => {
  it("pins chrome and makes .pane the vertical scroller", () => {
    const css = fs.readFileSync(path.join(__dirname, "../css/panel.css"), "utf8");
    assert.match(css, /\.pane\s*\{[^}]*min-height:\s*0/s);
    assert.match(css, /\.pane\s*\{[^}]*overflow-y:\s*scroll/s);
    assert.match(css, /html,\s*body\s*\{[^}]*overflow-y:\s*scroll/s);
    assert.match(css, /#app\s*\{[^}]*height:\s*100%/s);
    assert.match(css, /\.app\s*\{[^}]*min-height:\s*0/s);
    assert.doesNotMatch(css, /\.app\s*\{[^}]*min-height:\s*360px/s);
  });
});
