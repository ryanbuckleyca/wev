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
  process.chdir(__dirname);

  const isWindows = process.platform === 'win32';
  const pythonCmd = isWindows ? 'python' : 'python3';
  const venvBinDir = isWindows ? path.join('venv', 'Scripts') : path.join('venv', 'bin');
  
  const venvPythonCmd = path.join(venvBinDir, pythonCmd);
  const venvPipCmd = path.join(venvBinDir, 'pip');
  const venvPlaywrightCmd = path.join(venvBinDir, 'playwright');

  if (!fs.existsSync('venv')) {
    console.log('▶ Rebuilding Python Virtual Environment...');
    execVerbose(pythonCmd, ['-m', 'venv', 'venv']);
  }

  console.log('▶ Syncing Python Dependencies...');
  execVerbose(venvPipCmd, ['install', '--quiet', '-r', 'requirements.txt']);
  execVerbose(venvPipCmd, ['install', '--quiet', '-e', '.']);

  execVerbose(venvPlaywrightCmd, ['install', '--with-deps', 'chromium']);

  const args = process.argv.slice(2);
  const firstArg = args[0];

  if (['normalize', '--normalize', '-n'].includes(firstArg)) {
    execVerbose(venvPythonCmd, ['-m', 'utils.data_updater', ...args.slice(1)]);
  } else if (firstArg === 'municipality-backfill') {
    execVerbose(venvPythonCmd, ['-m', 'utils.backfill_municipality_canonical', ...args.slice(1)]);
  } else {
    execVerbose(venvPythonCmd, ['scrape.py', ...args]);
  }
}

main();
