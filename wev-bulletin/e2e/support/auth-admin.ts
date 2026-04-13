import { createClient } from '@supabase/supabase-js';

type AuthAdminClient = {
  auth: {
    admin: {
      listUsers: (args: { page: number; perPage: number }) => Promise<{
        data: {
          users: Array<{ id: string; email?: string | null }>;
        };
        error: { message: string } | null;
      }>;
      deleteUser: (id: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required e2e environment variable: ${name}`);
  }
  return value;
}

async function findUserIdByEmail(
  admin: AuthAdminClient,
  email: string,
): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 200;
  let page = 1;

  while (true) {
    const users = await admin.auth.admin.listUsers({ page, perPage });
    if (users.error) {
      throw new Error(`Failed listing users for deletion: ${users.error.message}`);
    }

    const hit = users.data.users.find(
      (candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail,
    );
    if (hit) return hit.id;

    if (users.data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

export async function deleteAuthUserByEmail(email: string): Promise<void> {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error('Missing required e2e environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const targetId = await findUserIdByEmail(admin as AuthAdminClient, email);
  if (!targetId) return;

  const deletion = await admin.auth.admin.deleteUser(targetId);
  if (deletion.error) {
    throw new Error(`Failed deleting auth user: ${deletion.error.message}`);
  }
}
