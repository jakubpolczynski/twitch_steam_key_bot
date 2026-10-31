"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseConfig, parseList, normalizeName } = require("../src/config");

test("preview is the default; optional nickname settings may be absent", () => {
  assert.deepEqual(parseConfig({ channels: "some_channel" }), {
    mode: "preview", channels: ["some_channel"], ignoredUsers: [], highlightedUsers: [],
  });
});

test("lists accept legacy semicolons, commas, whitespace and duplicate names", () => {
  assert.deepEqual(parseList(" #Alice, BOB; alice; ;"), ["alice", "bob"]);
  assert.equal(normalizeName(undefined), "");
});

test("legacy ignored users are merged rather than overridden", () => {
  const config = parseConfig({
    channels: "#One,Two;ONE", BOT_MODE: " Clipboard ",
    doNotDispalyNickNames: "Legacy;", IGNORE_USERS: "New,LEGACY",
    highlightNickNames: "VIP;",
  });
  assert.equal(config.mode, "clipboard");
  assert.deepEqual(config.channels, ["one", "two"]);
  assert.deepEqual(config.ignoredUsers, ["legacy", "new"]);
  assert.deepEqual(config.highlightedUsers, ["vip"]);
  assert.ok(Object.isFrozen(config.channels));
});

for (const channels of [undefined, "", " ; ,", "https://twitch.tv/name", "valid,bad-name"]) {
  test(`invalid channels fail before connection: ${String(channels)}`, () => {
    assert.throws(() => parseConfig({ channels }), /Set channels/);
  });
}

test("unknown and legacy automation modes fail closed", () => {
  for (const mode of ["paste", "auto", "true", ""]) {
    assert.throws(() => parseConfig({ channels: "one", BOT_MODE: mode }), /BOT_MODE/);
  }
});
