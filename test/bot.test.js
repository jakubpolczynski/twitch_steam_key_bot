"use strict";

const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const FIRST = "ABCDE-12345-FGHIJ";
const SECOND = "KLMNO-67890-PQRST";
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeClient() {
  const client = new EventEmitter();
  client.connect = mock.fn(async () => {});
  client.disconnect = mock.fn(async () => {});
  return client;
}

function options(extra = {}) {
  const client = fakeClient();
  return {
    client,
    argv: [],
    env: { channels: "#One,Two" },
    loadEnv: mock.fn(),
    createClient: mock.fn(() => client),
    logger: { log: mock.fn(), warn: mock.fn(), error: mock.fn() },
    ...extra,
  };
}

test("importing bot.js has no network, clipboard or keyboard side effects", (t) => {
  const originalLoad = Module._load;
  const externalLoads = [];
  t.mock.method(Module, "_load", function (id, ...args) {
    if (["tmi.js", "@nut-tree-fork/nut-js", "robotjs", "dotenv"].includes(id)) {
      externalLoads.push(id);
      throw new Error(`Unexpected import: ${id}`);
    }
    return Reflect.apply(originalLoad, this, [id, ...args]);
  });
  const spawn = t.mock.method(require("node:child_process"), "spawn", () => {
    throw new Error("Import must not spawn a clipboard process");
  });
  delete require.cache[require.resolve("../bot")];
  assert.equal(typeof require("../bot").main, "function");
  assert.deepEqual(externalLoads, []);
  assert.equal(spawn.mock.callCount(), 0);
});

test("keyboard mock stays untouched in preview, clipboard success and clipboard failure", async (t) => {
  const keyboard = { pressKey: mock.fn(), releaseKey: mock.fn(), type: mock.fn() };
  const robot = { typeString: mock.fn(), keyTap: mock.fn() };
  const originalLoad = Module._load;
  const keyboardModules = [];
  t.mock.method(Module, "_load", function (id, ...args) {
    if (id === "@nut-tree-fork/nut-js") {
      keyboardModules.push(id);
      return { keyboard, Key: { Enter: "enter", V: "v", LeftControl: "ctrl" } };
    }
    if (id === "robotjs") {
      keyboardModules.push(id);
      return robot;
    }
    return Reflect.apply(originalLoad, this, [id, ...args]);
  });
  // Reload local modules under the guard, so top-level regressions are caught too.
  for (const id of ["../bot", "../src/clipboard", "../src/message-handler"]) {
    delete require.cache[require.resolve(id)];
  }
  const { main } = require("../bot");
  for (const mode of ["preview", "clipboard"]) {
    const clipboard = { writeText: mock.fn(async (key) => {
      if (key === SECOND) throw new Error("simulated clipboard failure");
    }) };
    const opts = options({ env: { channels: "one", BOT_MODE: mode }, clipboard });
    const bot = await main(opts);
    await bot.handler("#one", { username: "viewer" }, FIRST, false);
    await bot.handler("#one", { username: "viewer" }, SECOND, false);
    assert.equal(clipboard.writeText.mock.callCount(), mode === "clipboard" ? 2 : 0);
    await bot.stop();
  }
  assert.deepEqual(keyboardModules, []);
  for (const fn of [...Object.values(keyboard), ...Object.values(robot)]) {
    assert.equal(fn.mock.callCount(), 0);
  }
});

test("subscribes before connecting, uses parsed channels and disconnects on stop", async () => {
  const opts = options();
  opts.client.connect = mock.fn(async () => {
    assert.equal(opts.client.listenerCount("message"), 1);
  });
  const bot = await require("../bot").main(opts);
  assert.deepEqual(opts.createClient.mock.calls[0].arguments[0], {
    channels: ["one", "two"], connection: { reconnect: true },
  });
  opts.client.emit("message", "#one", { username: "viewer" }, FIRST, false);
  await tick();
  assert.ok(opts.logger.log.mock.calls.some((call) => call.arguments[0].includes("[PREVIEW]")));
  opts.client.emit("disconnected", "private reason");
  opts.client.emit("error", new Error("private reason"));
  assert.equal(opts.logger.warn.mock.callCount(), 1);
  assert.equal(opts.logger.error.mock.callCount(), 1);
  await bot.stop();
  assert.equal(opts.client.listenerCount("message"), 0);
  assert.equal(opts.client.disconnect.mock.callCount(), 1);
});

test("--preview overrides an existing clipboard setting", async () => {
  const clipboard = { writeText: mock.fn() };
  const opts = options({ argv: ["--preview"], env: { channels: "one", BOT_MODE: "clipboard" }, clipboard });
  const bot = await require("../bot").main(opts);
  await bot.handler("#one", { username: "viewer" }, FIRST, false);
  assert.equal(clipboard.writeText.mock.callCount(), 0);
  await bot.stop();
});

test("--demo runs offline in preview without loading .env or constructing a client", async () => {
  const opts = options({ argv: ["--demo"], env: { BOT_MODE: "clipboard" } });
  await require("../bot").main(opts);
  assert.equal(opts.loadEnv.mock.callCount(), 0);
  assert.equal(opts.createClient.mock.callCount(), 0);
  assert.ok(opts.logger.log.mock.calls.some((call) => call.arguments[0].includes("[PREVIEW]")));
  assert.ok(!JSON.stringify(opts.logger.log.mock.calls).includes("ZZZZZ-99999-XXXXX"));
});

test("invalid configuration and CLI arguments fail before connecting", async () => {
  for (const extra of [
    { env: {} }, { env: { channels: "one", BOT_MODE: "paste" } }, { argv: ["--auto-enter"] },
  ]) {
    const opts = options(extra);
    await assert.rejects(require("../bot").main(opts));
    assert.equal(opts.createClient.mock.callCount(), 0);
  }
});

test("environment loading errors propagate before any connection", async () => {
  const opts = options({ loadEnv() { throw new Error("unreadable env file"); } });
  await assert.rejects(require("../bot").main(opts), /unreadable/);
  assert.equal(opts.createClient.mock.callCount(), 0);
});

test("the real .env loader parses quoted channel lists and respects process environment", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "twitch-bot-env-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, ".env"), 'channels="#One,Two"\nBOT_MODE=clipboard\nIGNORE_USERS=Alice;BOB\n');
  const script = [
    'require(process.argv[1]).loadEnvironment();',
    'console.log(JSON.stringify(require(process.argv[2]).parseConfig(process.env)));',
  ].join("");
  for (const [env, expectedMode] of [[{}, "clipboard"], [{ BOT_MODE: "preview" }, "preview"]]) {
    const result = spawnSync(process.execPath, [
      "-e", script, require.resolve("../bot"), require.resolve("../src/config"),
    ], { cwd, env, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.equal(config.mode, expectedMode);
    assert.deepEqual(config.channels, ["one", "two"]);
    assert.deepEqual(config.ignoredUsers, ["alice", "bob"]);
  }
});

test("initial connection failures retain listeners for the library reconnection", async () => {
  const opts = options();
  opts.client.connect = mock.fn(async () => { throw new Error("connection refused"); });
  const bot = await require("../bot").main(opts);
  assert.equal(opts.client.listenerCount("message"), 1);
  assert.equal(opts.client.connect.mock.callCount(), 1);
  assert.match(opts.logger.warn.mock.calls[0].arguments[0], /reconnection/);
  await bot.stop();
  assert.equal(opts.client.reconnect, false);
  assert.equal(opts.client.listenerCount("message"), 0);
  assert.equal(opts.client.listenerCount("disconnected"), 0);
  assert.equal(opts.client.listenerCount("error"), 0);
});

test("channel options remain mutable for the real tmi.js constructor", async () => {
  const opts = options();
  opts.createClient = (clientOptions) => {
    clientOptions.channels[0] = "#one";
    return opts.client;
  };
  const bot = await require("../bot").main(opts);
  await bot.stop();
});

test("stop is idempotent and tolerates an already disconnected client", async () => {
  const opts = options();
  opts.client.readyState = () => "CLOSED";
  const bot = await require("../bot").main(opts);
  await bot.stop();
  await bot.stop();
  assert.equal(opts.client.disconnect.mock.callCount(), 0);
});

test("async message rejections are caught at the EventEmitter boundary", async () => {
  const opts = options();
  const bot = await require("../bot").main(opts);
  opts.logger.log = () => { throw new Error("logger broken"); };
  opts.client.emit("message", "#one", { username: "viewer" }, FIRST, false);
  await tick();
  assert.equal(opts.logger.error.mock.callCount(), 1);
  await bot.stop();
});
