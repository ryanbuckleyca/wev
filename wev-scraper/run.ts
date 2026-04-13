import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

function execVerbose(cmd: string, args: string[] = []) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
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
    // If no direct task match, default to scrape.py but pass all args
    execVerbose(venvPythonCmd, ['scrape.py', ...args]);
  }
}

main();
