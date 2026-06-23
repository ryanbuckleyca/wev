import { spawnSync } from "node:child_process";
import path from "node:path";
import { envHelpLines, parseEnvFlag, type TargetEnv } from "../scripts/parse-env";

function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");

  if (args.includes("--help") || args.includes("-h")) {
    console.error(envHelpLines("seed", ["local", "staging"]));
    process.exit(0);
  }

  const env = parseEnvFlag(args, {
    allow: ["local", "staging"],
    defaultEnv: "local",
  }) as TargetEnv;

  const script = env === "staging" ? "seed-staging.ts" : "seed-local.ts";
  const scriptPath = path.join(__dirname, script);
  const result = spawnSync("npx", ["tsx", scriptPath], {
    stdio: "inherit",
    shell: true,
  });
  process.exit(result.status ?? 1);
}

main();
