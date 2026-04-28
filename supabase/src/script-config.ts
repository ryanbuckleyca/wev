import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env") });

function failConfig(scriptName: string, message: string): never {
  console.error(`[${scriptName}] Configuration error: ${message}`);
  process.exit(1);
}

function getRequiredEnv(scriptName: string, envName: string): string {
  const value = process.env[envName]?.trim();
  if (!value) {
    failConfig(
      scriptName,
      `Missing ${envName}. Refusing to continue without an explicit Supabase target.`,
    );
  }
  return value;
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

interface ScriptConfigParams {
  urlEnv: string;
  keyEnvNames: string[];
  keyDescription?: string;
}

export function getSupabaseScriptConfig(
  scriptName: string,
  { urlEnv, keyEnvNames, keyDescription }: ScriptConfigParams,
) {
  const standardizedKeys = keyEnvNames.map((k) =>
    k.replace("SECRET_KEY", "SERVICE_ROLE_KEY"),
  );

  return {
    url: getRequiredEnv(scriptName, urlEnv),
    serviceRoleKey: getRequiredAnyEnv(
      scriptName,
      standardizedKeys,
      keyDescription,
    ),
  };
}
