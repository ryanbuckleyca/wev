import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv: string[]) {
  const args = argv.filter((a) => a !== "--");

  if (args.includes("--help") || args.includes("-h")) {
    console.error(
      "Usage: npm run scrape:list-sources [-- --staging]\n\n" +
        "  (no flags)  List sources from .env Supabase project\n" +
        "  --staging   Use .env.staging overrides",
    );
    process.exit(0);
  }

  const unknown = args.filter((a) => a !== "--staging");
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(", ")}`);
    console.error("Usage: npm run scrape:list-sources [-- --staging]");
    process.exit(1);
  }

  return { staging: args.includes("--staging") };
}

function loadTargetEnv(staging: boolean) {
  const root = process.cwd();
  loadEnv({ path: path.join(root, ".env") });
  if (staging) {
    loadEnv({ path: path.join(root, ".env.staging"), override: true });
  }
}

async function main() {
  const { staging } = parseArgs(process.argv.slice(2));
  loadTargetEnv(staging);

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
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

  console.log(`Sources from ${url}:`);
  for (const row of data) {
    const slug = row.slug ?? "<missing slug>";
    const name = row.name ?? "Unknown Source";
    console.log(`  - ${slug} (${name})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
