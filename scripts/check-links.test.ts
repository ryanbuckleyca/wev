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

test("checkLinksInContent: skips case-insensitive HTTP/HTTPS, scheme-relative URLs, and empty links", () => {
  const content = [
    "[uppercase http](HTTP://EXAMPLE.COM/PATH)",
    "[mixed https](Https://example.com/test?query=1)",
    "[scheme relative](//cdn.example.com/library.js)",
    "[empty target]()",
  ].join("\n");

  const results = checkLinksInContent(content, "/repo/docs/test.md", "/repo");
  assert.equal(results.length, 0);
});

test("checkLinksInContent: resolves relative links between distributed README files across directories", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "readme-links-test-"));
  try {
    const rootReadme = path.join(tempDir, "README.md");
    const subDir = path.join(tempDir, "subproject");
    const subReadme = path.join(subDir, "README.md");
    const otherDir = path.join(tempDir, "docs");
    const otherReadme = path.join(otherDir, "README.md");

    fs.mkdirSync(subDir, { recursive: true });
    fs.mkdirSync(otherDir, { recursive: true });
    fs.writeFileSync(rootReadme, "# Root", "utf-8");
    fs.writeFileSync(subReadme, "# Sub", "utf-8");
    fs.writeFileSync(otherReadme, "# Docs", "utf-8");

    // Root README linking to subproject and docs READMEs
    const rootContent = [
      "- [Subproject](subproject/README.md)",
      "- [Docs](./docs/README.md)",
    ].join("\n");
    const rootResults = checkLinksInContent(rootContent, rootReadme, tempDir);
    assert.equal(rootResults.length, 0);

    // Subproject README linking up to root README and across to sibling README
    const subContent = [
      "- [Root](../README.md)",
      "- [Docs](../docs/README.md)",
      "- [Broken sibling](../nonexistent/README.md)",
    ].join("\n");
    const subResults = checkLinksInContent(subContent, subReadme, tempDir);
    assert.equal(subResults.length, 1);
    assert.equal(subResults[0].target, "../nonexistent/README.md");
    assert.equal(subResults[0].reason, "Target file does not exist");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("repository READMEs: ensures distributed README files are discoverable and have valid relative links", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const allMdFiles = findMarkdownFiles(repoRoot);
  const readmeFiles = allMdFiles.filter((file) =>
    path.basename(file).toLowerCase().includes("readme"),
  );

  // Assert distributed READMEs exist
  assert.ok(
    readmeFiles.length >= 5,
    `Expected multiple distributed READMEs, found ${readmeFiles.length}`,
  );

  // Assert main README exists and links to key distributed component READMEs
  const mainReadmePath = path.join(repoRoot, "README.md");
  assert.ok(fs.existsSync(mainReadmePath), "Root README.md must exist");
  const mainReadmeContent = fs.readFileSync(mainReadmePath, "utf-8");
  assert.ok(
    mainReadmeContent.includes("wev-bulletin/README.md"),
    "Main README should link to wev-bulletin/README.md for discoverability",
  );
  assert.ok(
    mainReadmeContent.includes("wev-scraper/README.md"),
    "Main README should link to wev-scraper/README.md for discoverability",
  );
  assert.ok(
    mainReadmeContent.includes("supabase/README.md"),
    "Main README should link to supabase/README.md for discoverability",
  );
  assert.match(
    mainReadmeContent,
    /\[[^\]]+\]\(wev-bulletin\/lib\/cv\/README\.md\)/,
    "Main README should link to wev-bulletin/lib/cv/README.md for discoverability",
  );

  // Assert sub-READMEs are discoverable from their parent READMEs
  const bulletinReadme = fs.readFileSync(
    path.join(repoRoot, "wev-bulletin/README.md"),
    "utf-8",
  );
  assert.ok(
    bulletinReadme.includes("components/README.md"),
    "wev-bulletin/README.md should link to components/README.md",
  );

  const supabaseReadme = fs.readFileSync(
    path.join(repoRoot, "supabase/README.md"),
    "utf-8",
  );
  assert.ok(
    supabaseReadme.includes("backup.md"),
    "supabase/README.md should link to backup.md",
  );

  const scraperReadme = fs.readFileSync(
    path.join(repoRoot, "wev-scraper/README.md"),
    "utf-8",
  );
  assert.ok(
    scraperReadme.includes("scrapers/README.md"),
    "wev-scraper/README.md should link to scrapers/README.md",
  );

  // Verify that all relative links inside all repository READMEs are valid
  for (const readme of readmeFiles) {
    const broken = checkLinksInFile(readme);
    assert.deepEqual(
      broken,
      [],
      `Expected no broken links in ${path.relative(repoRoot, readme)}, but found: ${JSON.stringify(broken)}`,
    );
  }
});
