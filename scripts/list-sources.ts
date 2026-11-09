import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  envHelpLines,
  loadEnvFiles,
  parseEnvFlag,
  type ScrapeEnv,
} from "./parse-env";

function loadExplicitOnlySlugs(): Set<string> {
  const jsonPath = path.join(
    __dirname,
    "..",
    "wev-scraper",
    "scrapers",
    "explicit_only_sources.json",
  );
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as unknown;
  if (!Array.isArray(raw) || !raw.every((s) => typeof s === "string")) {
    throw new Error(`Expected string[] in ${jsonPath}, got ${typeof raw}`);
  }
  return new Set(raw);
}

/** Mirrors wev-scraper SOURCE_NAME_TO_SLUG for opt-in API sources (null slug). */
const API_SOURCE_NAME_TO_SLUG: Record<string, string> = {
  serpapi: "serpapi",
  "google jobs": "serpapi",
  "serpapi google jobs": "serpapi",
  apify: "apify",
  "apify job bank": "apify",
  "apify (canada job bank)": "apify",
  jobbank: "apify",
  "job bank": "apify",
  "canada job bank": "apify",
  "canada job bank (apify)": "apify",
  thejobsapi: "thejobsapi",
  "the jobs api": "thejobsapi",
  tja: "thejobsapi",
  theirstack: "theirstack",
};

function normalizeSourceName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isExplicitOnlySource(
  row: { name?: string | null; slug?: string | null },
  explicitOnly: Set<string>,
): boolean {
  const slug = (row.slug || "").trim();
  if (slug && explicitOnly.has(slug)) return true;
  // Legacy jobbank slug → apify (same as Python LEGACY_SLUG_ALIASES).
  if (slug === "jobbank" && explicitOnly.has("apify")) return true;
  const byName = API_SOURCE_NAME_TO_SLUG[normalizeSourceName(row.name || "")];
  return Boolean(byName && explicitOnly.has(byName));
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.error(
      envHelpLines("scrape:list-sources", ["local", "staging", "prod"]),
    );
    process.exit(0);
  }

  const env = parseEnvFlag(argv, {
    allow: ["local", "staging", "prod"],
    defaultEnv: "local",
  }) as ScrapeEnv;

  loadEnvFiles(env);

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("sources")
    .select("name, slug")
    .order("slug", { nullsFirst: false });

  if (error) {
    console.error(`Failed to list sources: ${error.message}`);
    process.exit(1);
  }

  if (!data?.length) {
    console.log("No sources found.");
    return;
  }

  const explicitOnly = loadExplicitOnlySlugs();

  console.log(`Sources from ${url}:`);
  for (const row of data) {
    const slug = row.slug ?? "<missing slug>";
    const name = row.name ?? "Unknown Source";
    const optIn = isExplicitOnlySource(row, explicitOnly)
      ? " [explicit --source only]"
      : "";
    console.log(`  - ${slug} (${name})${optIn}`);
  }
  console.log(
    `\nAPI sources skipped unless named: ${[...explicitOnly].sort().join(", ")}`,
  );
  console.log("One API:  npm run scrape:local -- --source serpapi");
  console.log("All APIs: npm run scrape:local -- --apis");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
