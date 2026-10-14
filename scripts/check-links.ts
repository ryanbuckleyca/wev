import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".trunk",
  ".cache",
  "venv",
  ".venv",
  "archives",
  ".pytest_cache",
]);

export interface BrokenLink {
  file: string;
  line: number;
  linkText: string;
  target: string;
  resolvedPath: string;
  reason: string;
}

/**
 * Recursively scans a directory for markdown (.md) files, skipping ignored directories.
 *
 * @param dir The root directory path to scan.
 * @returns An array of absolute file paths for matching markdown files.
 */
export function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        results.push(...findMarkdownFiles(path.join(dir, entry.name)));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(path.join(dir, entry.name));
    }
  }

  return results;
}

/**
 * Scans markdown content for relative links, validating that their targets exist locally.
 *
 * Tracks opening and closing code block fences to ignore links inside code blocks,
 * strips query and hash components, and safely decodes percent-encoded targets.
 *
 * @param content The raw markdown file text.
 * @param filePath The path of the file being checked (used for resolving relative links).
 * @param repoRoot The repository root path (used for resolving leading-slash links).
 * @returns An array of BrokenLink descriptors for any invalid or missing link targets.
 */
export function checkLinksInContent(
  content: string,
  filePath: string,
  repoRoot: string = REPO_ROOT,
): BrokenLink[] {
  const lines = content.split("\n");
  const brokenLinks: BrokenLink[] = [];
  const fileDir = path.dirname(filePath);

  // Match Markdown links: [text](target "optional title") or ![alt](target)
  const linkRegex = /!?\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  let fenceChar: "`" | "~" | null = null;
  let fenceLength = 0;

  lines.forEach((lineText, lineIndex) => {
    if (fenceChar === null) {
      const openMatch = lineText.match(/^[ ]{0,3}(`{3,}|~{3,})(.*)$/);
      if (openMatch) {
        const marker = openMatch[1];
        const rest = openMatch[2];
        const char = marker[0] as "`" | "~";
        if (char !== "`" || !rest.includes("`")) {
          fenceChar = char;
          fenceLength = marker.length;
          return;
        }
      }
    } else {
      const closeRegex = new RegExp(
        `^[ ]{0,3}${fenceChar === "`" ? "`" : "~"}{${fenceLength},}\\s*$`,
      );
      if (closeRegex.test(lineText)) {
        fenceChar = null;
        fenceLength = 0;
        return;
      }
      return;
    }

    let match: RegExpExecArray | null;
    linkRegex.lastIndex = 0;

    while ((match = linkRegex.exec(lineText)) !== null) {
      const linkText = match[1];
      const rawTarget = match[2];

      // Skip external URLs, scheme-relative URLs, mailto, tel, or anchor-only links
      if (
        /^https?:\/\//i.test(rawTarget) ||
        rawTarget.startsWith("//") ||
        rawTarget.startsWith("mailto:") ||
        rawTarget.startsWith("tel:") ||
        rawTarget.startsWith("#") ||
        rawTarget === ""
      ) {
        continue;
      }

      // Strip query parameters and hash anchors before decoding
      const cleanTarget = rawTarget.split(/[?#]/)[0];
      if (!cleanTarget) {
        continue;
      }

      // Decode percent-encoded filenames so they match filesystem names
      let decodedTarget: string;
      try {
        decodedTarget = decodeURIComponent(cleanTarget);
      } catch {
        brokenLinks.push({
          file: path.relative(repoRoot, filePath),
          line: lineIndex + 1,
          linkText,
          target: rawTarget,
          resolvedPath: cleanTarget,
          reason: "Malformed percent-encoded target",
        });
        continue;
      }

      // Handle root-relative vs relative paths
      let resolvedPath: string;
      if (decodedTarget.startsWith("/")) {
        resolvedPath = path.join(repoRoot, decodedTarget.slice(1));
      } else {
        resolvedPath = path.resolve(fileDir, decodedTarget);
      }

      if (!fs.existsSync(resolvedPath)) {
        brokenLinks.push({
          file: path.relative(repoRoot, filePath),
          line: lineIndex + 1,
          linkText,
          target: rawTarget,
          resolvedPath: path.relative(repoRoot, resolvedPath),
          reason: "Target file does not exist",
        });
      }
    }
  });

  return brokenLinks;
}

/**
 * Reads a markdown file from disk and validates all relative links within it.
 *
 * @param filePath The absolute or relative path to the markdown file to inspect.
 * @returns An array of BrokenLink descriptors found in the file.
 */
export function checkLinksInFile(filePath: string): BrokenLink[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return checkLinksInContent(content, filePath, REPO_ROOT);
}

/**
 * CLI entrypoint that discovers all markdown files in the repository and validates relative links.
 * Exits with status code 1 if any broken links are detected.
 */
export function main() {
  console.log(
    "🔍 Scanning repository markdown files for relative link validity...",
  );
  const mdFiles = findMarkdownFiles(REPO_ROOT);
  console.log(`Found ${mdFiles.length} markdown files to inspect.`);

  const allBroken: BrokenLink[] = [];
  let checkedCount = 0;

  for (const file of mdFiles) {
    const broken = checkLinksInFile(file);
    if (broken.length > 0) {
      allBroken.push(...broken);
    }
    checkedCount++;
  }

  if (allBroken.length > 0) {
    console.error(`\n❌ Found ${allBroken.length} broken relative link(s):\n`);
    for (const item of allBroken) {
      console.error(
        `  - ${item.file}:${item.line} -> "${item.target}" (resolved: ${item.resolvedPath}) [${item.reason}]`,
      );
    }
    process.exit(1);
  } else {
    console.log(
      `\n✅ All relative links across ${checkedCount} markdown files are valid!\n`,
    );
  }
}

if (
  require.main === module ||
  (process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(__filename))
) {
  main();
}
