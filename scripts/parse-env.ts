import path from "node:path";
import { config as loadEnv } from "dotenv";

export type TargetEnv = "local" | "staging" | "prod";
export type ScrapeEnv = TargetEnv | "publish";

type ParseEnvOptions = {
  allow?: readonly string[];
  defaultEnv?: string;
};

/** Parse `--env <name>` with legacy `--staging` / `--prod` / `--publish` support. */
export function parseEnvFlag(
  argv: string[],
  { allow = ["local", "staging", "prod"], defaultEnv = "local" }: ParseEnvOptions = {},
): string {
  const args = argv.filter((a) => a !== "--");

  const envIndex = args.indexOf("--env");
  if (envIndex >= 0) {
    const value = args[envIndex + 1];
    if (!value || value.startsWith("-")) {
      console.error(`Error: --env requires one of: ${allow.join(", ")}`);
      process.exit(1);
    }
    if (!allow.includes(value)) {
      console.error(
        `Error: unknown --env "${value}". Allowed: ${allow.join(", ")}`,
      );
      process.exit(1);
    }
    return value;
  }

  if (args.includes("--staging")) return "staging";
  if (args.includes("--prod")) return "prod";
  if (args.includes("--publish") && allow.includes("publish")) return "publish";

  return defaultEnv;
}

/** Load repo `.env`, optionally layered with staging or production files. */
export function loadEnvFiles(
  target: string,
  root: string = process.cwd(),
): void {
  loadEnv({ path: path.join(root, ".env") });
  if (target === "staging") {
    loadEnv({ path: path.join(root, ".env.staging"), override: true });
  }
  if (target === "prod" || target === "publish") {
    loadEnv({ path: path.join(root, ".env.production"), override: true });
  }
}

export function envHelpLines(
  command: string,
  allow: readonly string[] = ["local", "staging", "prod"],
): string {
  const variants = allow
    .map((env) => `npm run ${command}:${env}`)
    .join(", ");
  return (
    `Usage: npm run ${command} [-- --env <name>]\n\n` +
    `  Aliases: ${variants}\n` +
    `  --env    One of: ${allow.join(", ")} (default: local)`
  );
}
