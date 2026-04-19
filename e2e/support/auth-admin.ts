import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

type AuthAdminClient = {
  auth: {
    admin: {
      createUser: (args: {
        email: string;
        password: string;
        email_confirm?: boolean;
      }) => Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
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

type ManagedE2EUser = {
  email: string;
  id: string;
  password: string;
};

function buildE2EUserIdentity(seed: string): {
  email: string;
  password: string;
} {
  const configuredPassword = process.env.E2E_TEST_USER_PASSWORD?.trim();
  const password =
    configuredPassword && configuredPassword.length >= 8
      ? configuredPassword
      : "WevE2E!Password123";

  const localPartPrefix = (
    process.env.E2E_TEST_USER_PREFIX?.trim() || "wev-e2e"
  )
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 20);
  const domain = (
    process.env.E2E_TEST_USER_DOMAIN?.trim() || "example.com"
  ).toLowerCase();
  const seedSlug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  const seedHash = createHash("sha256").update(seed).digest("hex").slice(0, 10);

  const localPart =
    `${localPartPrefix}+${seedSlug || "test-user"}-${seedHash}`.slice(0, 64);
  return {
    email: `${localPart}@${domain}`,
    password,
  };
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

export async function createManagedE2EUser(
  seed: string,
): Promise<ManagedE2EUser> {
  const { email, password } = buildE2EUserIdentity(seed);
  const admin = getServiceRoleClient() as unknown as AuthAdminClient &
    ReturnType<typeof getServiceRoleClient>;

  const existingId = await findUserIdByEmail(admin, email);
  if (existingId) {
    const deleted = await admin.auth.admin.deleteUser(existingId);
    if (deleted.error) {
      throw new Error(
        `Failed deleting existing e2e auth user: ${deleted.error.message}`,
      );
    }
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error || !created.data.user?.id) {
    throw new Error(
      `Failed creating e2e auth user: ${created.error?.message || "missing user id"}`,
    );
  }

  const userId = created.data.user.id;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    full_name: "E2E Test User",
    skills: [],
    values: [],
    work_types: ["remote"],
  });
  if (profileError) {
    throw new Error(
      `Failed preparing e2e profile row: ${profileError.message}`,
    );
  }

  const { error: roleError } = await admin.from("user_roles").upsert({
    user_id: userId,
    roles: ["user"],
  });
  if (roleError) {
    throw new Error(`Failed preparing e2e user role row: ${roleError.message}`);
  }

  return {
    email,
    id: userId,
    password,
  };
}
