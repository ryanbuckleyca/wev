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

interface BrokenLink {
  file: string;
  line: number;
  linkText: string;
  target: string;
  resolvedPath: string;
  reason: string;
}

function findMarkdownFiles(dir: string): string[] {
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

function checkLinksInFile(filePath: string): BrokenLink[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const brokenLinks: BrokenLink[] = [];
  const fileDir = path.dirname(filePath);

  // Match Markdown links: [text](target "optional title") or ![alt](target)
  const linkRegex = /!?\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  let inCodeBlock = false;

  lines.forEach((lineText, lineIndex) => {
    const trimmed = lineText.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      return;
    }

    if (inCodeBlock) {
      return;
    }

    let match: RegExpExecArray | null;
    linkRegex.lastIndex = 0;

    while ((match = linkRegex.exec(lineText)) !== null) {
      const linkText = match[1];
      const rawTarget = match[2];

      // Skip external URLs, mailto, tel, or anchor-only links
      if (
        rawTarget.startsWith("http://") ||
        rawTarget.startsWith("https://") ||
        rawTarget.startsWith("mailto:") ||
        rawTarget.startsWith("tel:") ||
        rawTarget.startsWith("#") ||
        rawTarget === ""
      ) {
        continue;
      }

      // Strip query parameters and hash anchors
      const cleanTarget = rawTarget.split("?")[0].split("#")[0];
      if (!cleanTarget) {
        continue;
      }

      // Handle root-relative vs relative paths
      let resolvedPath: string;
      if (cleanTarget.startsWith("/")) {
        resolvedPath = path.join(REPO_ROOT, cleanTarget.slice(1));
      } else {
        resolvedPath = path.resolve(fileDir, cleanTarget);
      }

      if (!fs.existsSync(resolvedPath)) {
        brokenLinks.push({
          file: path.relative(REPO_ROOT, filePath),
          line: lineIndex + 1,
          linkText,
          target: rawTarget,
          resolvedPath: path.relative(REPO_ROOT, resolvedPath),
          reason: "Target file does not exist",
        });
      }
    }
  });

  return brokenLinks;
}

function main() {
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

main();
