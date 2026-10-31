"use strict";

// Preserve the original three-group (4–5 chars) and five-group (4–6 chars)
// candidates. Boundaries prevent accepting a fragment of a longer token.
const KEY_PATTERN = /(?<![A-Za-z0-9_-])(?:[A-Za-z0-9]{4,6}(?:-[A-Za-z0-9]{4,6}){4}|[A-Za-z0-9]{4,5}(?:-[A-Za-z0-9]{4,5}){2})(?![A-Za-z0-9_-])/;

function extractKey(message) {
  if (typeof message !== "string") return null;
  return KEY_PATTERN.exec(message)?.[0].toUpperCase() ?? null;
}

module.exports = { extractKey };
