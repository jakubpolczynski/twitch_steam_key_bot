"use strict";

const { spawn } = require("node:child_process");

function createClipboardWriter({
  platform = process.platform,
  spawnProcess = spawn,
  timeoutMs = 3000,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Clipboard timeout must be a positive integer.");
  }

  return {
    async writeText(text) {
      const command = {
        win32: ["clip.exe", []],
        darwin: ["pbcopy", []],
        linux: ["xclip", ["-selection", "clipboard"]],
      }[platform];
      if (!command) throw new Error("Unsupported clipboard platform.");

      return new Promise((resolve, reject) => {
        let child;
        let settled = false;
        let timer;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        const fail = (error) => {
          if (settled) return;
          finish(error);
          try { child?.kill(); } catch { /* Already exited. */ }
        };

        try {
          child = spawnProcess(command[0], command[1], {
            shell: false,
            windowsHide: true,
            stdio: ["pipe", "ignore", "ignore"],
          });
          // Attach listeners before writing: missing programs and EPIPE are async.
          child.on("error", fail);
          child.once("close", (code) => finish(
            code === 0 ? undefined : new Error(`Clipboard command exited with code ${code}.`),
          ));
          child.stdin.on("error", fail);
          timer = setTimeout(() => fail(new Error("Clipboard command timed out.")), timeoutMs);
          child.stdin.end(text, "utf8");
        } catch (error) {
          fail(error);
        }
      });
    },
  };
}

module.exports = { createClipboardWriter };
