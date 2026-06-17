import { spawnSync } from "node:child_process";
import path from "node:path";

function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");

  if (args.includes("--help") || args.includes("-h")) {
    console.error(
      "Usage: npm run seed [-- --staging]\n\n" +
        "  (no flags)  Seed local Supabase with the E2E dataset\n" +
        "  --staging   Seed staging (production sources + fixture jobs)",
    );
    process.exit(0);
  }

  const unknown = args.filter((a) => a !== "--staging");
  if (unknown.length > 0) {
    console.error(`✗ Unknown argument(s): ${unknown.join(", ")}`);
    console.error("Usage: npm run seed [-- --staging]");
    process.exit(1);
  }

  const script = args.includes("--staging") ? "seed-staging.ts" : "seed-local.ts";
  const scriptPath = path.join(__dirname, script);
  const result = spawnSync("npx", ["tsx", scriptPath], {
    stdio: "inherit",
    shell: true,
  });
  process.exit(result.status ?? 1);
}

main();
