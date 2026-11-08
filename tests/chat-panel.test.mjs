import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createHudChatPanel } from "../node_modules/@rb/halo/src/ui/chat-panel.js";
import { createHudTextEditor } from "../node_modules/@rb/halo/src/hud-text-editor.js";

const bus = new EventTarget();

// Node's EventTarget treats `true` as capture on add, and ignores it on remove.
// A browser removes the listener either way. Normalize so dispose actually lets go.
function listenerOptions(opts) {
  if (opts === true) return { capture: true };
  if (opts === false) return { capture: false };
  return opts;
}

globalThis.window = {
  addEventListener: (type, fn, opts) => bus.addEventListener(type, fn, listenerOptions(opts)),
  removeEventListener: (type, fn, opts) => bus.removeEventListener(type, fn, listenerOptions(opts)),
  dispatchEvent: (event) => bus.dispatchEvent(event),
  setInterval,
  clearInterval,
};

function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

function key(name) {
  const event = new Event("keydown", { cancelable: true });
  event.key = name;
  event.preventDefault = () => {};
  window.dispatchEvent(event);
}

function pointer(target, type, x, y) {
  const event = new Event(type);
  event.clientX = x;
  event.clientY = y;
  event.button = 0;
  event.buttons = 0;
  target.dispatchEvent(event);
}

function harness() {
  const canvas = new EventTarget();
  const windows = {};
  const created = [];
  const lineCalls = [];
  const hudSystem = {
    hud: {
      layoutW: 800,
      layoutH: 800,
      ui: { windows },
      objects: { windows: {} },
    },
    createWindow(keyName, opts) {
      created.push({ key: keyName, opts });
      windows[keyName] = {
        x: opts.x,
        y: opts.y,
        w: opts.w,
        h: opts.h,
        collapsed: false,
        scrollable: true,
        scrollTop: 0,
        title: opts.title,
        _footerReservedHeightPx: 48,
      };
      hudSystem.hud.objects.windows[keyName] = {};
    },
    setWindowLines(keyName, entries, options) {
      lineCalls.push({ key: keyName, entries, options });
    },
    setWindowHidden() {},
    bringToFront() {},
    setWindowTextCaret() {},
    setWindowTextSelection() {},
    setWindowScrollTop() {},
    destroyWindow(keyName) {
      delete windows[keyName];
    },
  };
  const domElement = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }),
    addEventListener: (type, fn, opts) => canvas.addEventListener(type, fn, listenerOptions(opts)),
    removeEventListener: (type, fn, opts) => canvas.removeEventListener(type, fn, listenerOptions(opts)),
    dispatchEvent: (event) => canvas.dispatchEvent(event),
  };
  return {
    hudSystem,
    renderer: { domElement, xr: { isPresenting: false } },
    created,
    lineCalls,
    domElement,
  };
}

function lastFooter(lineCalls) {
  const call = lineCalls.at(-1);
  const footer = call?.options?.footerEntries;
  assert.ok(Array.isArray(footer), "the transcript paint must carry a footer");
  return footer;
}

describe("riders chat", { concurrency: false }, () => {
test("the say field is the footer of the one riders window", () => {
  const env = harness();
  const sent = [];
  const panel = createHudChatPanel({
    hudSystem: env.hudSystem,
    renderer: env.renderer,
    transport: {
      subscribe() {
        return () => {};
      },
      send(text) {
        sent.push(text);
        return Promise.resolve();
      },
    },
    key: "race-chat",
    title: "RIDERS",
    x: 16,
    y: 16,
    w: 360,
    h: 260,
    composerHeight: 72,
  });
  try {
    assert.equal(env.created.length, 1);
    assert.equal(env.created[0].key, "race-chat");
    assert.equal(env.created[0].opts.title, "RIDERS");
    assert.equal(env.created[0].opts.h, 332);
    assert.equal(panel.windowKeys().transcript, "race-chat");
    assert.equal(panel.windowKeys().composer, "race-chat");
    assert.equal(env.created.some((item) => item.opts.title === "SAY"), false);

    const empty = lastFooter(env.lineCalls);
    assert.equal(empty.length, 1);
    assert.equal(empty[0].actionButtonText, "Say something");
    assert.equal(empty[0].actionButtonSourceText, "");

    const win = env.hudSystem.hud.ui.windows["race-chat"];
    pointer(env.renderer.domElement, "mousedown", win.x + 40, win.y + win.h - 20);
    pointer(window, "mouseup", win.x + 40, win.y + win.h - 20);
    key("a");
    key("b");

    const typed = lastFooter(env.lineCalls);
    assert.equal(typed[0].actionButtonText, "ab");
    assert.equal(typed[0].actionButtonSourceText, "ab");
    assert.equal(panel.isTyping(), true);
  } finally {
    panel.dispose();
  }
});

test("enter sends the footer text and clears it only after the send succeeds", async () => {
  const env = harness();
  let fail = true;
  const sent = [];
  const panel = createHudChatPanel({
    hudSystem: env.hudSystem,
    renderer: env.renderer,
    transport: {
      subscribe() {
        return () => {};
      },
      send(text) {
        sent.push(text);
        if (fail) return Promise.reject(new Error("offline"));
        return Promise.resolve();
      },
    },
    key: "race-chat",
    title: "RIDERS",
    h: 260,
    composerHeight: 72,
  });
  try {
    const win = env.hudSystem.hud.ui.windows["race-chat"];
    pointer(env.renderer.domElement, "mousedown", win.x + 40, win.y + win.h - 20);
    pointer(window, "mouseup", win.x + 40, win.y + win.h - 20);
    key("h");
    key("i");
    assert.equal(panel.isTyping(), true);
    assert.equal(lastFooter(env.lineCalls)[0].actionButtonSourceText, "hi");
    key("Enter");
    await settle();
    assert.deepEqual(sent, ["hi"]);
    assert.equal(lastFooter(env.lineCalls)[0].actionButtonSourceText, "hi");

    fail = false;
    key("Enter");
    await settle();
    assert.deepEqual(sent, ["hi", "hi"]);
    assert.equal(lastFooter(env.lineCalls)[0].actionButtonText, "Say something");
    assert.equal(lastFooter(env.lineCalls)[0].actionButtonSourceText, "");
  } finally {
    panel.dispose();
  }
});

test("a window editor still receives the footer buttons it was given", () => {
  const env = harness();
  env.hudSystem.createWindow("notes", { title: "NOTES", x: 0, y: 0, w: 400, h: 300 });
  const editor = createHudTextEditor({
    renderer: env.renderer,
    hudSystem: env.hudSystem,
    windowKey: "notes",
    initialText: "seed",
    footerEntries: [{ actionButtonText: "Save" }],
  });
  try {
    const footer = lastFooter(env.lineCalls);
    assert.equal(footer[0].actionButtonText, "Save");
    assert.equal(editor.getText(), "seed");
  } finally {
    editor.dispose();
  }
});
});
