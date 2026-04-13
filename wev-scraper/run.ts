import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import * as readline from 'node:readline';

function execVerbose(cmd: string, args: string[] = []) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function confirmProd(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question("⚠️  RUNNING AGAINST PRODUCTION. Type 'YES' to continue: ", (answer) => {
      rl.close();
      resolve(answer === 'YES');
    });
  });
}

async function main() {
  const scraperRootDir = path.resolve(__dirname);
  process.chdir(scraperRootDir);

  const isWindows = process.platform === 'win32';
  const pythonCmdName = isWindows ? 'python' : 'python3';
  const venvBinDir = isWindows ? path.join('venv', 'Scripts') : path.join('venv', 'bin');

  const venvPythonCmd = path.join(venvBinDir, pythonCmdName);
  const venvPipCmd = path.join(venvBinDir, 'pip');
  const venvPlaywrightCmd = path.join(venvBinDir, 'playwright');

  if (!fs.existsSync('venv')) {
    console.log('▶ Rebuilding Python Virtual Environment...');
    execVerbose(pythonCmdName, ['-m', 'venv', 'venv']);
  }

  // Pass-through arguments
  const args = process.argv.slice(2);
  const task = args[0];
  const isProd = args.includes('--prod');

  // Prompt before any output is piped — readline uses stderr so it's visible
  // even when stdout is piped (e.g. `npm run scrape -- --prod 2>&1 | head`).
  if (isProd && process.stdin.isTTY) {
    const confirmed = await confirmProd();
    if (!confirmed) process.exit(0);
  }

  // Map task names to script paths
  const taskMap: Record<string, string> = {
    'scrape': 'scrape.py',
    'skills:index': 'scripts/build_esco_skills_index.py',
    'skills:embeddings': 'scripts/seed_esco_embeddings.py',
    'normalize': 'utils/data_updater.py',
    'municipality-backfill': 'utils/backfill_municipality_canonical.py'
  };

  const scriptPath = taskMap[task];

  if (scriptPath) {
    const scriptArgs = args.slice(1);

    // Ensure dependencies are synced if we're running a main task
    if (['scrape', 'skills:index', 'skills:embeddings'].includes(task)) {
      console.log('▶ Syncing Python Dependencies...');
      execVerbose(venvPipCmd, ['install', '--quiet', '-r', 'requirements.txt']);
      execVerbose(venvPipCmd, ['install', '--quiet', '-e', '.']);

      if (task === 'scrape') {
        execVerbose(venvPlaywrightCmd, ['install', '--with-deps', 'chromium']);
      }
    }

    console.log(`▶ Executing ${scriptPath}...`);
    execVerbose(venvPythonCmd, [scriptPath, ...scriptArgs]);
  } else {
    console.error(`Unknown task: "${task}". Valid tasks: ${Object.keys(taskMap).join(', ')}`);
    process.exit(1);
  }
}

main();
