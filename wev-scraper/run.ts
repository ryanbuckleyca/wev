import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import * as readline from "node:readline";

function execVerbose(cmd: string, args: string[] = []) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Pick a Python for venv creation (wev-scraper requires-python: 3.10–3.12 in pyproject.toml).
// Order matches the Makefile: prefer 3.11, then 3.12, then 3.10 — 3.11 is the safest default
// on Intel macOS for torch/transformers wheels; 3.12 is fine on most platforms (see repo README).
// Override with PYTHON_BIN=… to force a specific interpreter.
function pickPythonInterpreter(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const candidates =
    process.platform === "win32"
      ? ["python"]
      : ["python3.11", "python3.12", "python3.10", "python3"];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return process.platform === "win32" ? "python" : "python3";
}

async function confirmProd(mode: "prod" | "publish"): Promise<boolean> {
  const label =
    mode === "prod"
      ? "PRODUCTION (full)"
      : "PRODUCTION DB (publish — local LLMs)";
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question(
      `⚠️  RUNNING AGAINST ${label}. Type 'YES' to continue: `,
      (answer) => {
        rl.close();
        resolve(answer === "YES");
      },
    );
  });
}

async function main() {
  const scraperRootDir = path.resolve(__dirname);
  process.chdir(scraperRootDir);

  const isWindows = process.platform === "win32";
  const pythonCmdName = isWindows ? "python" : "python3";
  const venvBinDir = isWindows
    ? path.join("venv", "Scripts")
    : path.join("venv", "bin");

  const venvPythonCmd = path.join(venvBinDir, pythonCmdName);
  const venvPipCmd = path.join(venvBinDir, "pip");
  const venvPlaywrightCmd = path.join(venvBinDir, "playwright");

  if (!fs.existsSync("venv")) {
    const interpreter = pickPythonInterpreter();
    console.log(
      `▶ Rebuilding Python Virtual Environment with ${interpreter}...`,
    );
    execVerbose(interpreter, ["-m", "venv", "venv"]);
  }

  // Pass-through arguments
  const args = process.argv.slice(2);
  const task = args[0];
  const isProd = args.includes("--prod");
  const isPublish = args.includes("--publish");

  // Prompt before any output is piped — readline uses stderr so it's visible
  // even when stdout is piped (e.g. `npm run scrape -- --prod 2>&1 | head`).
  if ((isProd || isPublish) && process.stdin.isTTY) {
    const confirmed = await confirmProd(isProd ? "prod" : "publish");
    if (!confirmed) process.exit(0);
    // Signal to scrape.py that the prod confirmation has already been handled
    process.env.PROD_CONFIRMED = "1";
  }

  // Map task names to script paths
  const taskMap: Record<string, string> = {
    scrape: "scrape.py",
    "skills:index": "scripts/build_esco_skills_index.py",
    "skills:embeddings": "scripts/seed_esco_embeddings.py",
    "unified-post": "scripts/unified_post_processor.py",
    normalize: "utils/data_updater.py",
    "municipality-backfill": "utils/backfill_municipality_canonical.py",
  };

  const scriptPath = taskMap[task];

  if (scriptPath) {
    const scriptArgs = args.slice(1).filter((a) => a !== "--");

    // Ensure dependencies are synced if we're running a main task
    if (
      ["scrape", "skills:index", "skills:embeddings", "unified-post"].includes(
        task,
      )
    ) {
      console.log("▶ Syncing Python Dependencies...");
      execVerbose(venvPipCmd, ["install", "--quiet", "-r", "requirements.txt"]);
      execVerbose(venvPipCmd, ["install", "--quiet", "-e", "."]);

      if (task === "scrape") {
        execVerbose(venvPlaywrightCmd, ["install", "--with-deps", "chromium"]);
      }
    }

    console.log(`▶ Executing ${scriptPath}...`);
    execVerbose(venvPythonCmd, [scriptPath, ...scriptArgs]);
  } else {
    console.error(
      `Unknown task: "${task}". Valid tasks: ${Object.keys(taskMap).join(", ")}`,
    );
    process.exit(1);
  }
}

main();
