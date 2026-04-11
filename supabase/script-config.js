const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
  // Update keyEnvNames to only include modern keys if requested, 
  // but for backward compatibility in the helper itself, we can just let it filter.
  // Actually, let's just make it clean.
  const standardizedKeys = keyEnvNames.map(k => k.replace('SECRET_KEY', 'SERVICE_ROLE_KEY'));
  
  return {
    url: getRequiredEnv(scriptName, urlEnv),
    serviceRoleKey: getRequiredAnyEnv(scriptName, standardizedKeys, keyDescription),
  };
}

module.exports = {
  getSupabaseScriptConfig,
};
