import path from "node:path";

function failConfig(scriptName: string, message: string): never {
  console.error(`[${scriptName}] Configuration error: ${message}`);
  process.exit(1);
}

function getRequiredAnyEnv(
  scriptName: string,
  envNames: string[],
  description?: string,
): string {
  for (const envName of envNames) {
    const value = process.env[envName]?.trim();
    if (value) {
      return value;
    }
  }

  failConfig(
    scriptName,
    `Missing ${envNames.join(" or ")}${
      description ? ` (${description})` : ""
    }. Refusing to continue without explicit Supabase credentials.`,
  );
}

export interface ScriptConfigParams {
  /** Primary URL env var (legacy). Prefer urlEnvNames when set. */
  urlEnv?: string;
  /** Ordered URL env vars; first non-empty wins. */
  urlEnvNames?: string[];
  /** Extra URL fallbacks after urlEnv (e.g. SUPABASE_URL from .env.production). */
  urlFallbackEnvNames?: string[];
  keyEnvNames: string[];
  keyDescription?: string;
}

/** Production Supabase credentials in `.env.production` (separate from local `.env`). */
export const PROD_SCRIPT_CONFIG: ScriptConfigParams = {
  urlEnvNames: ["SUPABASE_URL"],
  keyEnvNames: ["SUPABASE_SECRET_KEY"],
  keyDescription: "production secret key",
};

function resolveUrl(scriptName: string, params: ScriptConfigParams): string {
  if (params.urlEnvNames?.length) {
    return getRequiredAnyEnv(scriptName, params.urlEnvNames, "Supabase URL");
  }

  const urlNames = [
    ...(params.urlEnv ? [params.urlEnv] : []),
    ...(params.urlFallbackEnvNames ?? []),
  ];
  if (!urlNames.length) {
    failConfig(scriptName, "No Supabase URL env vars configured.");
  }
  return getRequiredAnyEnv(scriptName, urlNames, "Supabase URL");
}

export function getSupabaseScriptConfig(
  scriptName: string,
  params: ScriptConfigParams,
) {
  return {
    url: resolveUrl(scriptName, params),
    secretKey: getRequiredAnyEnv(
      scriptName,
      params.keyEnvNames,
      params.keyDescription,
    ),
  };
}
