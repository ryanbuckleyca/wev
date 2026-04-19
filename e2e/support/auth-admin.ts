import { createClient } from "@supabase/supabase-js";

type AuthAdminClient = {
  auth: {
    admin: {
      listUsers: (args: { page: number; perPage: number }) => Promise<{
        data: {
          users: Array<{ id: string; email?: string | null }>;
        };
        error: { message: string } | null;
      }>;
      deleteUser: (
        id: string,
      ) => Promise<{ error: { message: string } | null }>;
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
      throw new Error(
        `Failed listing users for deletion: ${users.error.message}`,
      );
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

function getServiceRoleClient() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error(
      "Missing required e2e environment variable: SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthUserIdByEmail(
  email: string,
): Promise<string | null> {
  const admin = getServiceRoleClient();
  return findUserIdByEmail(admin as AuthAdminClient, email);
}

export async function recalculateMatchesForUserId(
  userId: string,
): Promise<void> {
  const supabase = getServiceRoleClient();

  const { error } = await supabase.rpc("recalculate_matches_for_user", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed recalculating matches for user: ${error.message}`);
  }
}

export async function recalculateMatchesForEmail(email: string): Promise<void> {
  const userId = await getAuthUserIdByEmail(email);
  if (!userId) {
    throw new Error(`Could not find auth user ID for email: ${email}`);
  }

  await recalculateMatchesForUserId(userId);
}

export async function countJobMatchesForUserId(
  userId: string,
): Promise<number> {
  const supabase = getServiceRoleClient();

  const { count, error } = await supabase
    .from("job_matches")
    .select("job_id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed counting job matches: ${error.message}`);
  }

  return count ?? 0;
}

export async function deleteAuthUserByEmail(email: string): Promise<void> {
  const admin = getServiceRoleClient();

  const targetId = await findUserIdByEmail(admin as AuthAdminClient, email);
  if (!targetId) return;

  const deletion = await admin.auth.admin.deleteUser(targetId);
  if (deletion.error) {
    throw new Error(`Failed deleting auth user: ${deletion.error.message}`);
  }
}
