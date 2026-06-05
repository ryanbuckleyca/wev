const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(command, cwd) {
  const result = spawnSync(command, { cwd, shell: true, stdio: 'inherit' });
  return result.status ?? 1;
}

function withMutation({ filePath, find, replace }, fn) {
  const original = fs.readFileSync(filePath, 'utf8');
  if (!original.includes(find)) {
    throw new Error(`Mutation target not found in ${filePath}`);
  }
  const mutated = original.replace(find, replace);
  if (mutated === original) {
    throw new Error(`Mutation made no changes in ${filePath}`);
  }

  fs.writeFileSync(filePath, mutated, 'utf8');
  try {
    return fn();
  } finally {
    fs.writeFileSync(filePath, original, 'utf8');
  }
}

function expectFails(exitCode, label) {
  if (exitCode === 0) {
    throw new Error(`Mutation survived: ${label}`);
  }
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');

  const checks = [
    {
      label: 'wev-bulletin Button.test.tsx catches default type change',
      mutation: {
        filePath: path.join(repoRoot, 'wev-bulletin/components/Button.tsx'),
        find: "  type = 'button',",
        replace: "  type = 'submit',",
      },
      command: 'npm test components/Button.test.tsx --prefix wev-bulletin',
    },
    {
      label: 'wev-bulletin match-utils.test.ts catches legacy split change',
      mutation: {
        filePath: path.join(repoRoot, 'wev-bulletin/lib/match-utils.ts'),
        find: 'return Math.min(valueScore! * 0.6 + skillScore! * 0.4, 1.0);',
        replace: 'return Math.min(valueScore! * 0.5 + skillScore! * 0.5, 1.0);',
      },
      command: 'npm test lib/match-utils.test.ts --prefix wev-bulletin',
    },
    {
      label: 'wev-bulletin account schema tests catch weakened min length',
      mutation: {
        filePath: path.join(repoRoot, 'wev-bulletin/lib/schemas/account.ts'),
        find: 'export const PasswordSchema = z.string().min(MIN_PASSWORD_LENGTH, {',
        replace: 'export const PasswordSchema = z.string().min(MIN_PASSWORD_LENGTH - 1, {',
      },
      command: 'npm test lib/schemas/account.test.ts --prefix wev-bulletin',
    },
    {
      label: 'wev-bulletin AuthStatus.test.tsx catches broken login href',
      mutation: {
        filePath: path.join(repoRoot, 'wev-bulletin/components/AuthStatus.tsx'),
        find: '<LinkButton href="/login" size="sm">',
        replace: '<LinkButton href="/signin" size="sm">',
      },
      command: 'npm test components/AuthStatus.test.tsx --prefix wev-bulletin',
    },
    {
      label: 'wev-scraper tests/test_url.py catches trailing slash regression',
      mutation: {
        filePath: path.join(repoRoot, 'wev-scraper/utils/url.py'),
        find: 'return url.rstrip("/") if url else ""',
        replace: 'return url if url else ""',
      },
      command: 'cd wev-scraper && (./venv/bin/pytest || python3 -m pytest) tests/test_url.py',
    },
  ];

  for (const check of checks) {
    process.stdout.write(`Running baseline for: ${check.label}\n`);
    const baselineStatus = run(check.command, repoRoot);
    if (baselineStatus !== 0) {
      throw new Error(`Baseline failed (tests must pass before mutation): ${check.label}`);
    }

    process.stdout.write(`Running mutation for: ${check.label}\n`);
    const status = withMutation(check.mutation, () => run(check.command, repoRoot));
    expectFails(status, check.label);
  }

  process.stdout.write('OK: all mutation smoke checks were caught by tests.\n');
}

main();

