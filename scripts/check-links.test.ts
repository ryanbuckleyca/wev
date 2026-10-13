import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkLinksInContent,
  checkLinksInFile,
  findMarkdownFiles,
} from "./check-links";

test("checkLinksInContent: ignores links inside 3-backtick code fences", () => {
  const content = [
    "# Test",
    "```",
    "[broken inside fence](./nonexistent.md)",
    "```",
    "outside text",
  ].join("\n");

  const results = checkLinksInContent(content, "/repo/docs/test.md", "/repo");
  assert.equal(results.length, 0);
});

test("checkLinksInContent: handles 4-backtick code fence containing 3-backtick fence", () => {
  const content = [
    "````markdown",
    "```bash",
    "[inner link](./nonexistent.md)",
    "```",
    "````",
    "[real broken link](./nonexistent-outer.md)",
  ].join("\n");

  const results = checkLinksInContent(content, "/repo/docs/test.md", "/repo");
  assert.equal(results.length, 1);
  assert.equal(results[0].target, "./nonexistent-outer.md");
});

test("checkLinksInContent: does not close backtick fence with tilde fence", () => {
  const content = [
    "```js",
    "~~~",
    "[still in fence](./nonexistent.md)",
    "```",
  ].join("\n");

  const results = checkLinksInContent(content, "/repo/docs/test.md", "/repo");
  assert.equal(results.length, 0);
});

test("checkLinksInContent: does not close fence if closing fence has trailing non-whitespace", () => {
  const content = [
    "```",
    "[link 1](./nonexistent.md)",
    "```extra-text",
    "[link 2](./nonexistent.md)",
    "```",
  ].join("\n");

  const results = checkLinksInContent(content, "/repo/docs/test.md", "/repo");
  assert.equal(results.length, 0);
});

test("checkLinksInContent: separates query and fragment before decoding and resolves percent-encoded targets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "link-check-test-"));
  try {
    const fileWithSpace = path.join(tempDir, "my document.md");
    fs.writeFileSync(fileWithSpace, "# Doc", "utf-8");

    const content = [
      "[valid encoded](./my%20document.md?version=2#section)",
      "[broken encoded](./other%20missing%20file.md#hash)",
    ].join("\n");

    const mdPath = path.join(tempDir, "readme.md");
    const results = checkLinksInContent(content, mdPath, tempDir);

    assert.equal(results.length, 1);
    assert.equal(results[0].target, "./other%20missing%20file.md#hash");
    assert.equal(results[0].reason, "Target file does not exist");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("checkLinksInContent: catches malformed percent-encoded targets without throwing", () => {
  const content = "[malformed target](./invalid%escape%99.md)".trim();
  const results = checkLinksInContent(content, "/repo/docs/test.md", "/repo");

  assert.equal(results.length, 1);
  assert.equal(results[0].target, "./invalid%escape%99.md");
  assert.equal(results[0].reason, "Malformed percent-encoded target");
});

test("checkLinksInContent: skips external URLs, mailto, tel, and anchor links", () => {
  const content = [
    "[https](https://example.com)",
    "[http](http://example.com)",
    "[mailto](mailto:test@example.com)",
    "[tel](tel:+1234567890)",
    "[anchor](#heading-title)",
  ].join("\n");

  const results = checkLinksInContent(content, "/repo/docs/test.md", "/repo");
  assert.equal(results.length, 0);
});
