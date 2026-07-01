import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { envHelpLines, parseEnvFlag } from "../scripts/parse-env";
import { loadTargetEnv } from "./lib/env";

const LOCAL_SUPABASE_CLI = path.resolve(
  process.cwd(),
  "node_modules/.bin/supabase",
);

function execVerbose(command: string) {
  // Replace the leading "supabase " token precisely — avoids corrupting commands
  // where "supabase" appears elsewhere (e.g. as a flag value or workdir path).
  const finalCommand = command.startsWith("supabase ")
    ? `${LOCAL_SUPABASE_CLI} ${command.slice("supabase ".length)}`
    : command;
  const result = spawnSync(finalCommand, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function regenerateTypes(target: string) {
  console.log("▶ Regenerating Supabase TypeScript types...");
  execVerbose("npx tsx supabase/generate-types.ts " + target);
  console.log("▶ Regenerating Supabase Python types (Pydantic)...");
  execVerbose("npx tsx supabase/generate-types-python.ts " + target);
}

function tryPopulateEmbeddings() {
  const backupPath = path.resolve(
    process.cwd(),
    "supabase/backups/backup_public_esco_skills.json",
  );
  if (fs.existsSync(backupPath)) {
    console.log("  ✓ Backup found. Verifying embeddings...");
    execVerbose("npm run skills:embeddings -- --limit 1");
    return;
  }
  const hasJinaKey = !!process.env.JINA_API_KEY;
  const isLocalEnv = process.env.ENV_MODE === "local";
  if (!hasJinaKey && !isLocalEnv) {
    console.log(
      "  ⚠️  No backup found and JINA_API_KEY is not set — skipping embedding step.",
    );
    console.log(
      "  ℹ️  To populate embeddings, either restore from backup or set JINA_API_KEY.",
    );
    return;
  }
  console.log(
    "  ⚠️  No backup found at supabase/backups/backup_public_esco_skills.json",
  );
  console.log(
    "  ▶ Running FULL Jina embedding (this will take several minutes)...",
  );
  execVerbose("npm run skills:embeddings");
}

function runMigration(target: string, dryRun: boolean) {
  const config = loadTargetEnv(target);
  if (!config || !config.projectRef) {
    console.error(
      `✗ Error: SUPABASE_PROJECT_REF not set for ${target}, and it could not be derived from SUPABASE_URL`,
    );
    process.exit(1);
  }
  const projectRef = config.projectRef;

  console.log(`✓ Using project reference: ${projectRef}`);
  console.log(`▶ Linking to project: ${projectRef}`);
  execVerbose(`supabase link --project-ref "${projectRef}"`);

  console.log(
    `▶ Syncing migration history (fetching any missing files from remote)...`,
  );
  try {
    execSync(`${LOCAL_SUPABASE_CLI} migration fetch --linked`, {
      stdio: "pipe",
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" },
    });
  } catch {
    console.log("ℹ️  No remote-only migrations found or fetch failed.");
  }

  let dbPushCmd = `${LOCAL_SUPABASE_CLI} db push --yes`;
  if (dryRun) dbPushCmd += " --dry-run";
  // SUPABASE_DB_PASSWORD is passed via the environment (already loaded from
  // .env.production above) — the Supabase CLI reads it automatically.
  // Never interpolate credentials into shell command strings.

  console.log(`▶ Pushing local migrations...`);
  const pushRes = spawnSync(dbPushCmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" },
  });
  if (pushRes.status !== 0) {
    console.error(
      "❌ Push failed. If you see hash mismatches, you may need to 'git pull' first.",
    );
    process.exit(1);
  } else {
    console.log("✅ Success!");
  }

  if (!dryRun) {
    regenerateTypes(target);
  }
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = process.env.MIGRATE_DRY_RUN === "1";

  if (args.includes("--help") || args.includes("-h")) {
    console.error(envHelpLines("migrate"));
    process.exit(0);
  }

  const target = parseEnvFlag(args);

  if (target === "local") {
    console.log("▶ Resetting local database...");
    execVerbose("supabase db reset");

    console.log("▶ Seeding database with E2E dataset...");
    execVerbose("npx tsx supabase/seed-local.ts");

    regenerateTypes("local");

    console.log("▶ Ensuring ESCO skill embeddings are populated...");
    tryPopulateEmbeddings();

    console.log("✨ Done.");
  } else if (target === "staging" || target === "prod") {
    console.log(`▶ Starting migration for ${target}...`);
    runMigration(target, dryRun);
    console.log("✨ Done.");
  } else {
    console.error(`✗ Unsupported target: ${target}`);
    process.exit(1);
  }
}

main();
