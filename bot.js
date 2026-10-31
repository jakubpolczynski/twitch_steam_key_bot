"use strict";

const { parseConfig } = require("./src/config");
const { createClipboardWriter } = require("./src/clipboard");
const { createMessageHandler } = require("./src/message-handler");

function loadEnvironment() {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function createTwitchClient(options) {
  // Loading this module or running the offline demo never opens a connection.
  const { Client } = require("tmi.js");
  return new Client(options);
}

async function main({
  argv = process.argv.slice(2),
  env = process.env,
  loadEnv = loadEnvironment,
  createClient = createTwitchClient,
  clipboard,
  logger = console,
} = {}) {
  if (argv.some((arg) => !["--preview", "--demo"].includes(arg))) {
    throw new Error("Supported arguments: --preview, --demo");
  }

  const demo = argv.includes("--demo");
  if (!demo) loadEnv();
  const config = parseConfig({
    ...env,
    ...(demo ? { channels: "demo", IGNORE_USERS: "ignored_user" } : {}),
    ...(demo || argv.includes("--preview") ? { BOT_MODE: "preview" } : {}),
  });
  const handler = createMessageHandler({
    config,
    // Preview does not even construct a clipboard adapter.
    clipboard: config.mode === "clipboard" ? clipboard ?? createClipboardWriter() : undefined,
    logger,
  });
  logger.log(`Mode: ${config.mode}. Keyboard automation is disabled.`);

  if (demo) {
    await handler("#demo", { username: "viewer" }, "Example: ABCDE-12345-FGHIJ", false);
    await handler("#demo", { username: "ignored_user" }, "ZZZZZ-99999-XXXXX", false);
    return { handler };
  }

  const client = createClient({
    // tmi.js normalizes its array in place; keep validated config immutable.
    channels: [...config.channels],
    connection: { reconnect: true },
  });
  let stopped = false;
  // EventEmitter does not await async listeners. Catch every rejected handler.
  const onMessage = (...args) => {
    void handler(...args).catch(() => logger.error("Message processing failed; no keyboard fallback."));
  };
  const onDisconnected = () => {
    if (stopped) return;
    logger.warn("Twitch disconnected; waiting for reconnection.");
  };
  const onError = () => logger.error("Twitch client error.");
  client.on("message", onMessage);
  client.on("disconnected", onDisconnected);
  client.on("error", onError);

  const removeListeners = () => {
    client.removeListener("message", onMessage);
    client.removeListener("disconnected", onDisconnected);
    client.removeListener("error", onError);
  };
  try {
    await client.connect();
  } catch {
    // tmi.js schedules its own retries. Keep message listeners attached.
    logger.warn("Initial Twitch connection failed; waiting for library reconnection.");
  }

  return {
    client,
    handler,
    async stop() {
      if (stopped) return;
      stopped = true;
      client.reconnect = false;
      removeListeners();
      const drained = handler.stop();
      try {
        if (typeof client.readyState !== "function" || client.readyState() !== "CLOSED") {
          await client.disconnect();
        }
      } finally {
        await drained;
      }
    },
  };
}

if (require.main === module) {
  // Keep Node's default signal handling: Ctrl+C terminates the process, including
  // reconnect timers owned internally by tmi.js.
  main().catch((error) => {
    console.error(`Startup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = { main, loadEnvironment };
