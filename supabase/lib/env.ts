import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

export type TargetEnv = "local" | "staging" | "prod";

export interface SupabaseConfig {
  supabaseUrl: string;
  anonKey: string;
  projectRef?: string;
}

function loadEnvFile(filePath: string, override = false) {
  if (fs.existsSync(filePath)) {
    loadEnv({ path: filePath, override });
  }
}

export function loadTargetEnv(
  target: string,
  root: string = process.cwd(),
): SupabaseConfig {
  const validTargets = ["local", "staging", "prod"];
  if (!validTargets.includes(target)) {
    console.error(`✗ Error: Invalid target "${target}". Must be one of: ${validTargets.join(", ")}`);
    process.exit(1);
  }

  const envPath = fs.existsSync(path.join(root, ".env"))
    ? path.join(root, ".env")
    : path.join(root, "..", ".env");
  loadEnv({ path: envPath });

  if (target === "prod") {
    loadEnvFile(path.join(root, ".env.production"), true);
  } else if (target === "staging") {
    loadEnvFile(path.join(root, ".env.staging"), true);
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
    process.exit(1);
  }

  let projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!projectRef && supabaseUrl) {
    try {
      const urlObj = new URL(supabaseUrl);
      projectRef = urlObj.hostname.split(".")[0];
    } catch {
      // ignore
    }
  }

  return { supabaseUrl, anonKey, projectRef };
}
