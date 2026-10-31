"use strict";

const { normalizeName } = require("./config");
const { extractKey } = require("./keys");

function terminalText(value) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

function createMessageHandler({ config, clipboard, logger = console, maxPending = 50, maxRecent = 1000 }) {
  if (!["preview", "clipboard"].includes(config.mode)) throw new Error("Invalid bot mode.");
  if (config.mode === "clipboard" && typeof clipboard?.writeText !== "function") {
    throw new Error("Clipboard mode requires a clipboard writer.");
  }
  if (!Number.isInteger(maxPending) || maxPending < 1 || !Number.isInteger(maxRecent) || maxRecent < 1) {
    throw new Error("Queue and duplicate cache limits must be positive integers.");
  }
  const ignored = new Set(config.ignoredUsers);
  const highlighted = new Set(config.highlightedUsers);
  const pending = new Set();
  const recent = new Set();
  let queue = Promise.resolve();
  let stopped = false;

  const remember = (key) => {
    recent.add(key);
    if (recent.size > maxRecent) recent.delete(recent.values().next().value);
  };

  const onMessageHandler = async (target, context, message, self) => {
    if (stopped || self || !context || typeof context !== "object" || Array.isArray(context) || typeof message !== "string") return;
    const username = normalizeName(context.username);
    const displayName = normalizeName(context["display-name"]);
    // Filter both identities BEFORE logging, extraction, or side effects.
    if ((!username && !displayName) || ignored.has(username) || ignored.has(displayName)) return;

    const author = context["display-name"] || context.username;
    const text = terminalText(`${author} : ${message.trim()}`);
    logger.log(highlighted.has(username) || highlighted.has(displayName)
      ? `\x1b[41m\x1b[37m${text}\x1b[0m` : text);

    const key = extractKey(message);
    if (!key || recent.has(key) || pending.has(key)) return;
    if (config.mode === "preview") {
      logger.log(`[PREVIEW] Key detected: ${key}`);
      remember(key);
      return;
    }
    if (pending.size >= maxPending) {
      logger.warn("Clipboard queue is full; candidate skipped.");
      return;
    }

    pending.add(key);
    const operation = queue.then(async () => {
      try {
        if (stopped) return;
        await clipboard.writeText(key);
        remember(key);
        logger.log(`[CLIPBOARD] Copied: ${key}. Paste manually in the intended application.`);
      } catch {
        // Fail closed: never type, paste, press Enter, or log raw child errors.
        logger.error("Clipboard copy failed; no keyboard action was performed. Candidate can be retried.");
      } finally {
        pending.delete(key);
      }
    });
    // Recover even if a custom logger throws, so later messages can still run.
    queue = operation.catch(() => {});
    await operation;
  };
  // An in-flight system clipboard write may finish; queued writes are cancelled.
  onMessageHandler.stop = async () => {
    stopped = true;
    await queue;
  };
  return onMessageHandler;
}

module.exports = { createMessageHandler };
