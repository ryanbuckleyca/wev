const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../wev-scraper/.env') });

function failConfig(scriptName, message) {
  console.error(`[${scriptName}] Configuration error: ${message}`);
  process.exit(1);
}

function getRequiredEnv(scriptName, envName) {
  const value = process.env[envName]?.trim();
  if (!value) {
    failConfig(
      scriptName,
      `Missing ${envName}. Refusing to continue without an explicit Supabase target.`,
    );
  }
  return value;
}

function getRequiredAnyEnv(scriptName, envNames, description) {
  for (const envName of envNames) {
    const value = process.env[envName]?.trim();
    if (value) {
      return value;
    }
  }

  failConfig(
    scriptName,
    `Missing ${envNames.join(' or ')}${description ? ` (${description})` : ''}. Refusing to continue without explicit Supabase credentials.`,
  );
}

function getSupabaseScriptConfig(scriptName, { urlEnv, keyEnvNames, keyDescription }) {
  return {
    url: getRequiredEnv(scriptName, urlEnv),
    serviceRoleKey: getRequiredAnyEnv(scriptName, keyEnvNames, keyDescription),
  };
}

module.exports = {
  getSupabaseScriptConfig,
};
