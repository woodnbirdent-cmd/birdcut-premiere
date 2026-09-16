"use strict";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createUndoStack({ limit = 60 } = {}) {
  let past = [];
  let future = [];
  let current = null;

  return {
    reset(state) {
      current = deepClone(state);
      past = [];
      future = [];
      return this.get();
    },
    get() {
      return current == null ? null : deepClone(current);
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    push(nextState) {
      if (current != null) {
        past.push(deepClone(current));
        if (past.length > limit) past.shift();
      }
      current = deepClone(nextState);
      future = [];
      return this.get();
    },
    undo() {
      if (!this.canUndo()) return this.get();
      future.push(deepClone(current));
      current = past.pop();
      return this.get();
    },
    redo() {
      if (!this.canRedo()) return this.get();
      past.push(deepClone(current));
      current = future.pop();
      return this.get();
    }
  };
}

const api = { createUndoStack, deepClone };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutUndo = api;
}
