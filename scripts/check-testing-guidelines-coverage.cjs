const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sumCoverage(files) {
  const totals = {
    lines: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    statements: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
  };

  for (const f of files) {
    for (const k of Object.keys(totals)) {
      const entry = f[k];
      if (!entry) continue;
      totals[k].total += entry.total || 0;
      totals[k].covered += entry.covered || 0;
    }
  }

  function pct(covered, total) {
    return total > 0 ? (covered / total) * 100 : 100;
  }

  return {
    lines: pct(totals.lines.covered, totals.lines.total),
    branches: pct(totals.branches.covered, totals.branches.total),
    statements: pct(totals.statements.covered, totals.statements.total),
    functions: pct(totals.functions.covered, totals.functions.total),
    totals,
  };
}

function fmt(n) {
  return `${n.toFixed(2)}%`;
}

function sumPythonCoverage(files) {
  const totals = {
    statements: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
  };

  for (const f of files) {
    const summary = f.summary || f;
    const numStatements = summary.num_statements || 0;
    const coveredStatements = summary.covered_lines || 0;
    totals.statements.total += numStatements;
    totals.statements.covered += coveredStatements;

    const numBranches = summary.num_branches || 0;
    const coveredBranches = summary.covered_branches || 0;
    totals.branches.total += numBranches;
    totals.branches.covered += coveredBranches;
  }

  function pct(covered, total) {
    return total > 0 ? (covered / total) * 100 : 100;
  }

  return {
    lines: pct(totals.statements.covered, totals.statements.total),
    branches: pct(totals.branches.covered, totals.branches.total),
    totals,
  };
}

function parsePythonCoverage(coverageJsonPath, repoRoot) {
  if (!fs.existsSync(coverageJsonPath)) return null;
  const data = readJson(coverageJsonPath);

  const filesObj = data.files || {};
  const files = Object.entries(filesObj).map(([filePath, fileData]) => {
    const norm = filePath.replace(/\\/g, '/');
    const rel = norm.startsWith(repoRoot.replace(/\\/g, '/') + '/')
      ? norm.slice(repoRoot.length + 1)
      : norm;
    const relScraper = rel.replace(/^wev-scraper\//, '');
    return { filePath: relScraper, ...fileData };
  });

  const totals = data.totals || {};
  const hasBranchTotals = typeof totals.num_branches === 'number';
  const overall = {
    lines: typeof totals.percent_covered === 'number' ? totals.percent_covered : null,
    branches:
      typeof totals.percent_covered_branches === 'number'
        ? totals.percent_covered_branches
        : hasBranchTotals
          ? (totals.num_branches > 0 ? (totals.covered_branches / totals.num_branches) * 100 : 100)
          : null,
    totals,
  };

  return { files, overall };
}

function main() {
  const strict = process.argv.includes('--strict');
  const repoRoot = path.resolve(__dirname, '..');
  const summaryPath = path.join(repoRoot, 'wev-bulletin', 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    process.stderr.write(
      `Missing ${summaryPath}. Run: npm run test:coverage --prefix wev-bulletin\n`,
    );
    process.exit(2);
  }

  const summary = readJson(summaryPath);
  const allFiles = Object.entries(summary)
    .filter(([k]) => k !== 'total')
    .map(([filePath, data]) => ({ filePath, ...data }));

  const rel = (p) => p.replace(/\\/g, '/').replace(/^.*?wev-bulletin\//, '');

  const scraperCoveragePath = path.join(repoRoot, 'wev-scraper', 'coverage', 'coverage.json');
  const python = parsePythonCoverage(scraperCoveragePath, repoRoot);
  if (!python) {
    process.stderr.write(
      `Missing ${scraperCoveragePath}. Run: node scripts/generate-scraper-coverage.cjs\n`,
    );
    process.exit(2);
  }

  const groups = [
    {
      key: 'business',
      label: 'Business logic / utils',
      minLines: 90,
      minBranches: 90,
      files: (f) =>
        f.startsWith('lib/') &&
        !f.startsWith('lib/hooks/') &&
        !f.startsWith('lib/supabase/') &&
        !f.startsWith('lib/testing/'),
    },
    {
      key: 'components',
      label: 'React components',
      minLines: 80,
      minBranches: 80,
      files: (f) => f.startsWith('components/'),
    },
    {
      key: 'api',
      label: 'API routes / Server Actions',
      minLines: 85,
      minBranches: 85,
      files: (f) => f.startsWith('app/api/') && f.endsWith('/route.ts'),
    },
    {
      key: 'hooks',
      label: 'Custom hooks',
      minLines: 85,
      minBranches: 85,
      files: (f) => f.startsWith('hooks/') || f.startsWith('lib/hooks/'),
    },
  ];

  const pythonGroups = [
    {
      key: 'py-business',
      label: 'Business logic / utils (Python)',
      minLines: 90,
      minBranches: 90,
      files: (f) =>
        (f.startsWith('utils/') || f.startsWith('llm/') || f.startsWith('lib/')) &&
        !f.startsWith('tests/') &&
        !f.startsWith('scrapers/'),
    },
    {
      key: 'py-scraper-parsing',
      label: 'Scraper parsing logic',
      minLines: 85,
      minBranches: 85,
      files: (f) =>
        f.startsWith('scrapers/') ||
        f === 'utils/extractors.py' ||
        f === 'utils/normalize.py' ||
        f === 'utils/field_management.py' ||
        f === 'utils/location_parser.py',
    },
  ];

  const globalTargets = { minLines: 80, minBranches: 80 };
  const global = sumCoverage(allFiles.map((f) => f));

  let failed = false;
  const linesOut = [];

  const pythonAll = sumPythonCoverage(python.files);
  const combinedLinesPct =
    global.totals.lines.total + pythonAll.totals.statements.total > 0
      ? ((global.totals.lines.covered + pythonAll.totals.statements.covered) /
          (global.totals.lines.total + pythonAll.totals.statements.total)) *
        100
      : 100;
  const combinedBranchesPct =
    global.totals.branches.total + pythonAll.totals.branches.total > 0
      ? ((global.totals.branches.covered + pythonAll.totals.branches.covered) /
          (global.totals.branches.total + pythonAll.totals.branches.total)) *
        100
      : 100;

  linesOut.push(
    `Repo-wide gate (combined): lines ${fmt(combinedLinesPct)} (min ${globalTargets.minLines}%), branches ${fmt(combinedBranchesPct)} (min ${globalTargets.minBranches}%)`,
  );
  if (combinedLinesPct < globalTargets.minLines || combinedBranchesPct < globalTargets.minBranches) {
    failed = true;
  }

  linesOut.push(
    `Repo-wide (wev-bulletin): lines ${fmt(global.lines)}, branches ${fmt(global.branches)}`,
  );
  linesOut.push(
    `Repo-wide (wev-scraper): lines ${fmt(pythonAll.lines)}, branches ${fmt(pythonAll.branches)}`,
  );

  for (const g of groups) {
    const files = allFiles
      .map((f) => ({ ...f, relPath: rel(f.filePath) }))
      .filter((f) => g.files(f.relPath));

    const agg = sumCoverage(files);
    linesOut.push(
      `${g.label}: lines ${fmt(agg.lines)} (min ${g.minLines}%), branches ${fmt(agg.branches)} (min ${g.minBranches}%), files ${files.length}`,
    );
    if (agg.lines < g.minLines || agg.branches < g.minBranches) {
      failed = true;
    }
  }

  for (const g of pythonGroups) {
    const files = python.files.filter((f) => g.files(f.filePath));
    const agg = sumPythonCoverage(files);
    linesOut.push(
      `${g.label}: lines ${fmt(agg.lines)} (min ${g.minLines}%), branches ${fmt(agg.branches)} (min ${g.minBranches}%), files ${files.length}`,
    );
    if (agg.lines < g.minLines || agg.branches < g.minBranches) {
      failed = true;
    }
  }

  process.stdout.write(linesOut.join('\n') + '\n');
  if (failed && strict) process.exit(1);
  process.exit(0);
}

main();
