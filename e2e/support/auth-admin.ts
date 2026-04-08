import { createClient } from '@supabase/supabase-js';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required e2e environment variable: ${name}`);
  }
  return value;
}

export async function deleteAuthUserByEmail(email: string): Promise<void> {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL');
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error(
      'Missing required e2e environment variable: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY',
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) {
    throw new Error(`Failed listing users for deletion: ${users.error.message}`);
  }

  const target = users.data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!target) return;

  const deletion = await admin.auth.admin.deleteUser(target.id);
  if (deletion.error) {
    throw new Error(`Failed deleting auth user: ${deletion.error.message}`);
  }
}
