"use strict";

const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const { parseConfig } = require("../src/config");
const { createMessageHandler } = require("../src/message-handler");

const FIRST = "ABCDE-12345-FGHIJ";
const SECOND = "KLMNO-67890-PQRST";
const THIRD = "UVWXY-54321-ZABCD";
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup({ mode = "clipboard", writeText = async () => {}, env = {}, ...limits } = {}) {
  const clipboard = { writeText: mock.fn(writeText) };
  const logger = { log: mock.fn(), warn: mock.fn(), error: mock.fn() };
  const config = parseConfig({ channels: "channel", BOT_MODE: mode, ...env });
  const handler = createMessageHandler({ config, clipboard, logger, ...limits });
  const send = (message = FIRST, context = { username: "viewer" }, self = false) =>
    handler("#channel", context, message, self);
  return { clipboard, logger, handler, send };
}

test("ignored login or display name prevents both logging and clipboard actions", async () => {
  for (const context of [
    { username: "Ignored", "display-name": "Different" },
    { username: "different", "display-name": "  IGNORED  " },
  ]) {
    const { send, clipboard, logger } = setup({ env: { doNotDispalyNickNames: "ignored;" } });
    await send(FIRST, context);
    assert.equal(clipboard.writeText.mock.callCount(), 0);
    assert.equal(logger.log.mock.callCount(), 0);
  }
});

test("self messages and malformed events are ignored before any effect", async () => {
  const { send, handler, clipboard, logger } = setup();
  await send(FIRST, { username: "viewer" }, true);
  for (const context of [null, undefined, [], {}, "viewer"]) {
    await handler("#channel", context, FIRST, false);
  }
  for (const message of [null, undefined, 42]) {
    await handler("#channel", { username: "viewer" }, message, false);
  }
  assert.equal(clipboard.writeText.mock.callCount(), 0);
  assert.equal(logger.log.mock.callCount(), 0);
});

test("preview reports a candidate without touching the injected clipboard", async () => {
  const { send, clipboard, logger } = setup({
    mode: "preview",
    writeText: () => { throw new Error("must never be called"); },
  });
  await send(FIRST);
  assert.equal(clipboard.writeText.mock.callCount(), 0);
  assert.ok(logger.log.mock.calls.some(({ arguments: args }) => args[0].includes("[PREVIEW]")));
});

test("ordinary chat remains visible and selected users remain highlighted", async () => {
  const { send, clipboard, logger } = setup({ env: { highlightNickNames: "VIP;" } });
  await send("hello", { username: "vip", "display-name": "Vip" });
  assert.equal(clipboard.writeText.mock.callCount(), 0);
  assert.match(logger.log.mock.calls[0].arguments[0], /^\x1b\[41m\x1b\[37mVip : hello/);
});

test("untrusted terminal controls are stripped from chat output", async () => {
  const { send, logger } = setup({ mode: "preview" });
  await send("\x1b[2Jhello\n\x07", { username: "viewer" });
  assert.equal(logger.log.mock.calls[0].arguments[0], "viewer : [2Jhello");
});

test("clipboard mode copies the normalized candidate without submitting anything", async () => {
  const { send, clipboard } = setup();
  await send(FIRST.toLowerCase());
  assert.deepEqual(clipboard.writeText.mock.calls[0].arguments, [FIRST]);
});

test("duplicates are suppressed across casing, authors, channels and in-flight writes", async () => {
  let release;
  const { send, handler, clipboard } = setup({
    writeText: () => new Promise((resolve) => { release = resolve; }),
  });
  const first = send();
  await tick();
  await send(FIRST.toLowerCase(), { username: "other" });
  release();
  await first;
  await handler("#other_channel", { username: "someone" }, FIRST, false);
  assert.equal(clipboard.writeText.mock.callCount(), 1);
});

test("distinct concurrent messages are serialized in arrival order", async () => {
  const releases = [];
  const { send, clipboard } = setup({
    writeText: () => new Promise((resolve) => releases.push(resolve)),
  });
  const first = send(FIRST);
  const second = send(SECOND);
  await tick();
  assert.equal(clipboard.writeText.mock.callCount(), 1);
  releases[0]();
  await first;
  await tick();
  assert.equal(clipboard.writeText.mock.callCount(), 2);
  releases[1]();
  await second;
  assert.deepEqual(clipboard.writeText.mock.calls.map((call) => call.arguments[0]), [FIRST, SECOND]);
});

test("failed clipboard writes are reported, do not poison the queue and may be retried", async () => {
  let fail = true;
  const { send, clipboard, logger } = setup({
    writeText: async () => { if (fail) throw new Error("private child error"); },
  });
  await send(FIRST);
  assert.equal(logger.error.mock.callCount(), 1);
  assert.ok(!JSON.stringify(logger.error.mock.calls).includes("private child error"));
  fail = false;
  await send(FIRST);
  await send(SECOND);
  assert.equal(clipboard.writeText.mock.callCount(), 3);
});

test("queue remains usable after a synchronous clipboard exception", async () => {
  const { send, clipboard, logger } = setup({
    writeText: () => { throw new Error("EPIPE"); },
  });
  await Promise.all([send(FIRST), send(SECOND)]);
  assert.equal(clipboard.writeText.mock.callCount(), 2);
  assert.equal(logger.error.mock.callCount(), 2);
});

test("queue applies backpressure and permits a skipped candidate later", async () => {
  let release;
  const { send, clipboard, logger } = setup({
    maxPending: 1,
    writeText: () => new Promise((resolve) => { release = resolve; }),
  });
  const first = send(FIRST);
  await send(SECOND);
  assert.equal(logger.warn.mock.callCount(), 1);
  await tick();
  release();
  await first;
  const retry = send(SECOND);
  await tick();
  release();
  await retry;
  assert.equal(clipboard.writeText.mock.callCount(), 2);
});

test("duplicate cache is bounded and evicts the oldest successful candidate", async () => {
  const { send, clipboard } = setup({ maxRecent: 2 });
  for (const key of [FIRST, SECOND, THIRD, FIRST]) await send(key);
  assert.equal(clipboard.writeText.mock.callCount(), 4);
});

test("preview also suppresses duplicate candidate notifications", async () => {
  const { send, logger } = setup({ mode: "preview" });
  await send(FIRST);
  await send(FIRST.toLowerCase());
  assert.equal(logger.log.mock.calls.filter((call) => call.arguments[0].startsWith("[PREVIEW]")).length, 1);
});

test("shutdown cancels queued copies and ignores new messages", async () => {
  let release;
  const { send, handler, clipboard } = setup({
    writeText: () => new Promise((resolve) => { release = resolve; }),
  });
  const first = send(FIRST);
  const second = send(SECOND);
  await tick();
  const stopped = handler.stop();
  await send(THIRD);
  release();
  await Promise.all([first, second, stopped]);
  assert.equal(clipboard.writeText.mock.callCount(), 1);
});

test("invalid modes, adapters and queue bounds fail at construction", () => {
  const config = parseConfig({ channels: "channel", BOT_MODE: "clipboard" });
  assert.throws(() => createMessageHandler({ config }), /writer/);
  assert.throws(() => createMessageHandler({ config: { ...config, mode: "paste" } }), /mode/);
  for (const limits of [{ maxPending: 0 }, { maxRecent: -1 }, { maxPending: 1.5 }]) {
    assert.throws(() => createMessageHandler({ config, clipboard: { writeText() {} }, ...limits }), /limits/);
  }
});
