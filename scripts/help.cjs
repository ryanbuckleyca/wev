#!/usr/bin/env node
/**
 * Cheat sheet for repo scripts. npm run only lists script names — flags are
 * handled by each underlying CLI. Pass them after `--`.
 *
 * Per-command help:
 *   npm run migrate -- --help
 *   npm run restore -- --help
 *   npm run seed -- --help
 *   npm run scrape -- --help
 *   npm run process -- --help
 */

const sections = [
  {
    title: "Database",
    lines: [
      "npm run migrate                  local reset + seed + typegen",
      "npm run migrate -- --staging     push migrations to staging",
      "npm run migrate -- --prod        push migrations to production",
      "npm run restore                  restore backups → local",
      "npm run restore -- --staging     restore backups → staging",
      "npm run seed                     seed local (no full reset)",
      "npm run seed -- --staging        seed staging",
    ],
  },
  {
    title: "Scrape (flags: --staging, --prod, --publish, --source <slug>)",
    lines: [
      "npm run scrape:list-sources      fast — Supabase JS, skips Python/venv",
      "npm run scrape:list-sources -- --staging",
      "npm run scrape                   local, all sources",
      "npm run scrape -- --source mac   one source (alias: --slug)",
      "npm run scrape -- --staging --source cent",
      "npm run scrape -- --publish      prod DB, local LLMs (YES prompt)",
      "npm run scrape -- --prod         full prod (YES prompt)",
    ],
  },
  {
    title: "Process (local/staging only — no --prod or --publish)",
    lines: [
      "npm run process                  post-process jobs locally",
      "npm run process -- --staging --limit 50",
    ],
  },
  {
    title: "Skills",
    lines: [
      "npm run skills:index             ESCO API → JSON file",
      "npm run skills:index -- --upsert-db",
      "npm run skills:index -- --upsert-db --staging",
      "npm run skills:embeddings        embed skills locally",
      "npm run skills:embeddings -- --staging",
      "npm run skills:embeddings -- --prod",
    ],
  },
  {
    title: "Test suites (separate tasks — use colon names, not flags)",
    lines: [
      "npm run test                     bulletin + scraper unit tests",
      "npm run test:bulletin",
      "npm run test:scraper",
      "npm run test:e2e",
      "npm run test:db                  Supabase pgTAP",
      "npm run verify                   lint + tsc + test",
    ],
  },
];

console.log("Wev npm scripts — pass flags after `--`\n");
for (const { title, lines } of sections) {
  console.log(title);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
  console.log();
}
console.log("Full docs: README.md");
