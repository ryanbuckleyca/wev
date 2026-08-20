#!/usr/bin/env node
/**
 * Cheat sheet for repo scripts.
 *
 * Named env scripts are thin aliases: npm run scrape:staging → npm run scrape -- --env staging
 * Extra options after --: npm run scrape:prod -- --source mac
 *
 * `npm run help` — this file. Per-command: npm run scrape -- --help
 */

const sections = [
  {
    title: "Database",
    lines: [
      "npm run migrate                  default: local reset + seed + typegen",
      "npm run migrate:local / migrate:staging / migrate:prod",
      "npm run migrate -- --env staging   same as migrate:staging",
      "npm run restore:local / restore:staging",
      "npm run backup                     reads .env.production only",
      "npm run sync:local                 backup prod → restore local (keeps local profiles)",
      "npm run sync:staging               backup prod → restore staging",
      "npm run seed:local / seed:staging",
    ],
  },
  {
    title: "Scrape — named targets (show up in `npm run`)",
    lines: [
      "npm run scrape:list-sources      list slugs (fast, local DB)",
      "npm run scrape:list-sources:staging / :prod",
      "npm run scrape:local             local DB, all sources",
      "npm run scrape:staging           staging DB",
      "npm run scrape:publish           prod DB + local LLMs (YES prompt)",
      "npm run scrape:prod              full prod (YES prompt)",
      "npm run scrape:prod -- --source mac   one source on prod",
      "npm run scrape -- --env prod --source mac   same via flags",
    ],
  },
  {
    title: "Process (local/staging only)",
    lines: [
      "npm run process:local / process:staging",
      "npm run process -- --env staging --page-limit 50",
    ],
  },
  {
    title: "Skills",
    lines: [
      "npm run skills:index",
      "npm run skills:index -- --upsert-db [--staging]",
      "npm run skills:embeddings [-- --staging | --prod]",
    ],
  },
  {
    title: "Test",
    lines: [
      "npm run test / test:bulletin / test:scraper / test:e2e / test:db",
      "npm run verify",
    ],
  },
];

console.log("Wev npm scripts\n");
console.log(
  "Pattern:  scrape:staging  →  npm run scrape -- --env staging  (aliases for discoverability)",
);
console.log(
  "Options:  npm run scrape:prod -- --source mac  (extra flags after --)\n",
);
for (const { title, lines } of sections) {
  console.log(title);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
  console.log();
}
console.log("Full docs: README.md");
