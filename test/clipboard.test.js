"use strict";

const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createClipboardWriter } = require("../src/clipboard");

function fakeProcess(onEnd = () => {}) {
  const child = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = mock.fn((...args) => onEnd(child, ...args));
  child.kill = mock.fn(() => true);
  return child;
}

for (const [platform, command, args] of [
  ["win32", "clip.exe", []], ["darwin", "pbcopy", []],
  ["linux", "xclip", ["-selection", "clipboard"]],
]) {
  test(`clipboard adapter writes to stdin on ${platform}, never through a shell`, async () => {
    const child = fakeProcess((proc) => queueMicrotask(() => proc.emit("close", 0)));
    const spawnProcess = mock.fn(() => child);
    const clipboard = createClipboardWriter({ platform, spawnProcess });
    await clipboard.writeText("ABCDE-12345-FGHIJ");
    assert.deepEqual(spawnProcess.mock.calls[0].arguments, [
      command, args, { shell: false, windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
    ]);
    assert.deepEqual(child.stdin.end.mock.calls[0].arguments, ["ABCDE-12345-FGHIJ", "utf8"]);
    assert.equal(child.kill.mock.callCount(), 0);
  });
}

test("synchronous spawn failures are rejected without another action", async () => {
  const clipboard = createClipboardWriter({
    platform: "win32", spawnProcess() { throw new Error("spawn denied"); },
  });
  await assert.rejects(clipboard.writeText("key"), /spawn denied/);
});

test("missing clipboard executables reject on the child error event", async () => {
  const child = fakeProcess((proc) => queueMicrotask(() => proc.emit("error", new Error("ENOENT"))));
  const clipboard = createClipboardWriter({ platform: "linux", spawnProcess: () => child });
  await assert.rejects(clipboard.writeText("key"), /ENOENT/);
  assert.equal(child.kill.mock.callCount(), 1);
});

test("stdin errors (EPIPE) are handled even if the process later closes", async () => {
  const child = fakeProcess((proc) => queueMicrotask(() => {
    proc.stdin.emit("error", new Error("EPIPE"));
    proc.emit("close", 1);
  }));
  const clipboard = createClipboardWriter({ platform: "win32", spawnProcess: () => child });
  await assert.rejects(clipboard.writeText("key"), /EPIPE/);
});

test("a nonzero exit status or signal is a failure", async () => {
  for (const code of [1, null]) {
    const child = fakeProcess((proc) => queueMicrotask(() => proc.emit("close", code)));
    const clipboard = createClipboardWriter({ platform: "darwin", spawnProcess: () => child });
    await assert.rejects(clipboard.writeText("key"), /exited with code/);
  }
});

test("hung clipboard subprocesses time out and are terminated", async () => {
  const child = fakeProcess();
  const clipboard = createClipboardWriter({ platform: "linux", spawnProcess: () => child, timeoutMs: 15 });
  await assert.rejects(clipboard.writeText("key"), /timed out/);
  assert.equal(child.kill.mock.callCount(), 1);
});

test("unsupported platforms and invalid timeouts fail without spawning", async () => {
  const spawnProcess = mock.fn();
  const clipboard = createClipboardWriter({ platform: "aix", spawnProcess });
  await assert.rejects(clipboard.writeText("key"), /Unsupported/);
  assert.equal(spawnProcess.mock.callCount(), 0);
  for (const timeoutMs of [0, -1, Infinity, 1.5]) {
    assert.throws(() => createClipboardWriter({ timeoutMs }), /timeout/);
  }
});

test("synchronous stdin exceptions and kill exceptions do not mask the first error", async () => {
  const child = fakeProcess(() => { throw new Error("write failed"); });
  child.kill = () => { throw new Error("already exited"); };
  const clipboard = createClipboardWriter({ platform: "win32", spawnProcess: () => child });
  await assert.rejects(clipboard.writeText("key"), /write failed/);
});
