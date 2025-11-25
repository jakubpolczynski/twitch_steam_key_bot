const tmi = require("tmi.js");
const { keyboard, Key } = require("@nut-tree-fork/nut-js");
const dotenv = require("dotenv");

const { spawn } = require("child_process");

const client = new tmi.client({
  channels: [dotenv.config().parsed.channels],
});

const highlightNickNames = dotenv
  .config()
  .parsed.highlightNickNames.concat()
  .split(",");

const doNotDispalyNickNames = dotenv
  .config()
  .parsed.doNotDispalyNickNames.concat()
  .split(",");

client.connect();
client.on("message", onMessageHandler);

const re = new RegExp("[A-z0-9]{4,5}-[A-z0-9]{4,5}-[A-z0-9]{4,5}");
const re2 = new RegExp(
  "[A-z0-9]{4,6}-[A-z0-9]{4,6}-[A-z0-9]{4,6}-[A-z0-9]{4,6}-[A-z0-9]{4,6}"
);

async function onMessageHandler(target, context, msg, self) {
  if (self) {
    return;
  }
  const commandName = msg.trim();
  const result = re2.exec(commandName) || re.exec(commandName);
  if (result) {
    await copy_key(result[0]);
  }
  const displayName = context["display-name"] || context.username || "unknown";

  if (doNotDispalyNickNames.includes(displayName)) return;

  const isHighlight = highlightNickNames.includes(displayName);
  const border = "------------------------------------------------";
  const message = `${displayName} : ${commandName}`;

  console.log(border);
  if (isHighlight) {
    console.log("\x1b[41m\x1b[37m%s\x1b[0m", message);
  } else {
    console.log("%s", message);
  }
  console.log(border);
}

async function copy_key(key) {
  const border = "------------------------------------------------";

  key = String(key).trim();

  const platform = process.platform;

  try {
    if (platform === "win32" || platform === "darwin" || platform === "linux") {
      let proc;

      if (platform === "win32") {
        proc = spawn("clip", { windowsHide: true });
      } else if (platform === "darwin") {
        proc = spawn("pbcopy");
      } else {
        proc = spawn("xclip", ["-selection", "clipboard"]);
      }

      proc.stdin.write(key);
      proc.stdin.end();

      await new Promise((resolve, reject) => {
        proc.on("error", reject);
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error("clipboard command exited with code " + code));
        });
      });

      await pasteAndEnter();

      console.log("\x1b[32m%s\x1b[0m", border);
      console.log("\x1b[34m%s\x1b[0m", "Key: " + key + " copied to clipboard.");
      console.log("\x1b[32m%s\x1b[0m", border);
    } else {
      throw new Error("Unsupported platform for clipboard command");
    }
  } catch (error) {
    console.log(
      "Clipboard copy failed, falling back to typing. Reason:",
      error && error.message
    );
    robot.typeString(key);
    robot.keyTap("enter");

    console.log("\x1b[32m%s\x1b[0m", border);
    console.log(
      "\x1b[34m%s\x1b[0m",
      "Key: " + key + " typed instead of copied."
    );
    console.log("\x1b[32m%s\x1b[0m", border);
  }
}

async function pasteAndEnter() {
  // Ctrl + V
  await keyboard.pressKey(Key.LeftControl, Key.V);
  await keyboard.releaseKey(Key.LeftControl, Key.V);
  // Enter
  await keyboard.pressKey(Key.Enter);
}
