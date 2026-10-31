"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractKey } = require("../src/keys");

test("recognizes both legacy candidate formats and normalizes case", () => {
  assert.equal(extractKey("Code: (abcde-12345-fghij)!"), "ABCDE-12345-FGHIJ");
  assert.equal(extractKey("abcd-1234-efgh"), "ABCD-1234-EFGH");
  assert.equal(extractKey("abcdef-123456-ghijkl-789012-mnopqr"), "ABCDEF-123456-GHIJKL-789012-MNOPQR");
  assert.equal(extractKey("ABCD-12345-EFGHI-123456-JKLM"), "ABCD-12345-EFGHI-123456-JKLM");
});

test("selects only the first complete candidate in a message", () => {
  assert.equal(extractKey("ABCDE-12345-FGHIJ KLMNO-67890-PQRST"), "ABCDE-12345-FGHIJ");
});

test("does not match partial keys, extra groups or punctuation from the old A-z range", () => {
  for (const message of [
    "ABC_E-12345-FGHIJ", "ABC[E-12345-FGHIJ", "ABC`E-12345-FGHIJ",
    "ABCDEF-12345-FGHIJ", "ABCDE-12345-FGHIJK",
    "ABCDE-12345-FGHIJ-KLMNO", "X-ABCDE-12345-FGHIJ",
    "_ABCDE-12345-FGHIJ", "ABCDE-12345-FGHIJ_",
    "ABCDE-12345-FGHIJ-KLMNO-PQRST-UVWXY",
    "abc-12345-fghij", "ABCDE–12345–FGHIJ", "no key here",
    null, undefined, 12345,
  ]) {
    assert.equal(extractKey(message), null, String(message));
  }
});

test("matching is repeatable and has no global regular-expression cursor", () => {
  assert.equal(extractKey("ABCDE-12345-FGHIJ"), extractKey("ABCDE-12345-FGHIJ"));
});
