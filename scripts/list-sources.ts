import { createClient } from "@supabase/supabase-js";
import {
  envHelpLines,
  loadEnvFiles,
  parseEnvFlag,
  type ScrapeEnv,
} from "./parse-env";

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
