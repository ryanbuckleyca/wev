import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { loadEnvFiles } from "../../scripts/parse-env";

export type { TargetEnv } from "../../scripts/parse-env";

export interface SupabaseConfig {
  supabaseUrl: string;
  anonKey: string;
  projectRef?: string;
}

export function printExecError(error: unknown, prefix = "❌"): void {
  if (!(error instanceof Error)) return;
  console.error(`${prefix} ${error.message}`);
  const e = error as Error & {
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };
  if (e.stdout) console.error(String(e.stdout));
  if (e.stderr) console.error(String(e.stderr));
}

const VALID_TARGETS: readonly string[] = ["local", "staging", "prod"];

export function loadTargetEnv(
  target: string,
  root: string = process.cwd(),
): SupabaseConfig | null {
  if (!VALID_TARGETS.includes(target)) {
    console.error(
      `✗ Error: Invalid target "${target}". Must be one of: ${VALID_TARGETS.join(", ")}`,
    );
    return null;
  }

  loadEnvFiles(target, root);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) {
    const parentEnv = path.join(root, "..", ".env");
    if (fs.existsSync(parentEnv)) {
      loadEnv({ path: parentEnv });
    }
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error(
      "✗ Error: Missing SUPABASE_URL or ANON_KEY environment variables.",
    );
    return null;
  }

  let projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!projectRef && supabaseUrl) {
    try {
      const urlObj = new URL(supabaseUrl);
      projectRef = urlObj.hostname.split(".")[0];
    } catch {
      // invalid URL — leave undefined
    }
  }

  return { supabaseUrl, anonKey, projectRef };
}
