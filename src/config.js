"use strict";

function normalizeName(value) {
  return typeof value === "string" ? value.trim().replace(/^#/, "").toLowerCase() : "";
}

function parseList(value = "") {
  return [...new Set(String(value).split(/[,;]/).map(normalizeName).filter(Boolean))];
}

function parseConfig(env = process.env) {
  const mode = String(env.BOT_MODE ?? "preview").trim().toLowerCase();
  if (!["preview", "clipboard"].includes(mode)) {
    throw new Error("BOT_MODE must be preview or clipboard. Keyboard automation is not supported.");
  }
  const channels = parseList(env.channels);
  if (!channels.length || channels.some((name) => !/^[a-z0-9_]{1,25}$/.test(name))) {
    throw new Error("Set channels to a comma-separated list of Twitch channel names.");
  }

  return Object.freeze({
    mode,
    channels: Object.freeze(channels),
    // Keep the legacy misspelling and merge it with the new setting.
    ignoredUsers: Object.freeze(parseList([
      env.doNotDispalyNickNames ?? "",
      env.IGNORE_USERS ?? "",
    ].join(","))),
    highlightedUsers: Object.freeze(parseList(env.highlightNickNames)),
  });
}

module.exports = { normalizeName, parseList, parseConfig };
