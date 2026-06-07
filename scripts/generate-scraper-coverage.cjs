const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function run(command, cwd, env) {
  const result = spawnSync(command, { cwd, shell: true, stdio: 'inherit', env });
  return result.status ?? 1;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const scraperRoot = path.join(repoRoot, 'wev-scraper');
  const coverageDir = path.join(scraperRoot, 'coverage');
  const tmpDir = path.join(scraperRoot, '.tmp');

  ensureDir(coverageDir);
  ensureDir(tmpDir);

  const coverageJson = path.join(coverageDir, 'coverage.json');
  if (fs.existsSync(coverageJson)) fs.unlinkSync(coverageJson);

  const env = {
    ...process.env,
    TMPDIR: tmpDir,
    TEMP: tmpDir,
    TMP: tmpDir,
  };

  const activatePath = path.join(scraperRoot, 'venv', 'bin', 'activate');
  const baseCmd = fs.existsSync(activatePath)
    ? `. venv/bin/activate && pytest`
    : 'python3 -m pytest';

  const code = run(
    [
      baseCmd,
      '-p no:asyncio',
      '--cov',
      '--cov-branch',
      '--cov-report=json:coverage/coverage.json',
      '--cov-report=term-missing',
      'tests',
      'scrapers',
    ].join(' '),
    scraperRoot,
    env,
  );

  if (code !== 0) {
    process.stderr.write(
      [
        '',
        'Scraper coverage generation failed.',
        'If this is a local environment issue, ensure dev deps are installed:',
        '  cd wev-scraper && . venv/bin/activate && pip install -r requirements-dev.txt',
        '',
      ].join('\n'),
    );
    process.exit(code);
  }

  if (!fs.existsSync(coverageJson)) {
    process.stderr.write(`Expected ${coverageJson} to be created, but it was not found.\n`);
    process.exit(2);
  }
}

main();
