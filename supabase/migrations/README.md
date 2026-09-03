# Database Migrations Guide

This directory contains all schema changes (migrations) for the Supabase databases.

## 🛠 Standard Workflow: "It Just Works" (New!)

We use a custom migration script that handles environment linking and **auto-syncing** to prevent common Supabase CLI version mismatches.

### 🚀 How to Migrate

To apply your local migrations to a remote database, simply run:

```bash
./scripts/migrate.sh test    # Apply to wev-test
./scripts/migrate.sh prod    # Apply to wev-prod
```

### 🧠 How it Works (Self-Healing)

The script automatically:

1. **Links** to the correct project ref (test or prod).
2. **Auto-Syncs History**: Before pushing, it runs `supabase migration fetch` to download any missing remote migration files. This prevents the "Remote migration versions not found" error.
3. **Pushes**: Applies your new local changes to the cloud safely.
4. **Regenerates App Types**: After a successful push, it refreshes `lib/supabase/database.types.ts` so the app and e2e seeds stay aligned with the live schema.

---

## ✅ Best Practices

### 1. Naming Conventions

Always use a sortable timestamp prefix for new migrations:

```bash
# Template: YYYYMMDDHHMM_description.sql
202603191316_add_trigram_indexes.sql
```

### 2. Idempotent SQL (Safe to Re-run)

Always use `IF NOT EXISTS` to prevent errors if a script is partially applied:

```sql
CREATE TABLE IF NOT EXISTS my_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON my_table(column);
```

### 3. One Change Per Migration

Keep migrations focused. If you are adding a table and also updating an unrelated function, use two separate files.

### 4. Row Level Security (RLS)

Always include RLS policies in the same migration that creates a table:

```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data" ON my_table
  FOR SELECT USING (auth.uid() = user_id);
```

### 5. Restricted RPC grants

A new function in `public` is executable by `anon` and `authenticated` by default on
Supabase. Every SECURITY DEFINER function therefore has to declare its intended
audience in the `private.restricted_rpc` manifest:

```sql
INSERT INTO private.restricted_rpc (function_name, allowed_roles, is_optional, rationale)
VALUES ('my_new_rpc', '{service_role}', false, 'Why this exists and who calls it.');

SELECT private.apply_restricted_rpc_grants();
```

`allowed_roles` is exhaustive — any role not listed must not hold `EXECUTE`. Use
`'{anon,authenticated}'` for a genuinely public-facing RPC; the point is that the
decision is recorded rather than inherited from a default.

`private.apply_restricted_rpc_grants()` resolves each entry through `pg_proc`, so all
overloads are covered and a rename cannot silently no-op. It verifies the result and
raises if anything is off, so a bad deploy fails loudly instead of half-applying. It is
owner-only on purpose (migrations run as `postgres`); it is deliberately **not**
SECURITY DEFINER, because only a function's owner may change its ACL and granting
`EXECUTE` on a SECURITY DEFINER version of it would be an escalation path.

**When to re-run the helper:** `CREATE OR REPLACE` preserves a function's owner and
ACL, so replacing a body needs nothing. Grants are reset only when a function is
`DROP`ped and recreated, which is required to change its signature or return type.
Re-run the helper in that migration.

You do not have to remember, though: `supabase/tests/restricted_rpc_grants.test.sql`
asserts the real end state of the migrated database in CI. It fails if a restricted RPC
is reachable by the wrong role, if a manifest entry no longer resolves, or if a new
SECURITY DEFINER function in `public` has not been classified at all.

### 6. Keep Generated Types Fresh

If you need to refresh the app's database types without running a migration, use:

```bash
npm run types:supabase
```

This command reads `SUPABASE_PROJECT_REF` from your environment and, if that is not
set, derives it from `SUPABASE_URL`. It then regenerates
`lib/supabase/database.types.ts`.

---

## ❌ Anti-Patterns to Avoid

- **❌ Manual Dashboard SQL**: Never run schema-changing SQL in the Supabase Dashboard. If it's not in a `.sql` file, the team can't sync it.
- **❌ Manual Project Linking**: Don't use `supabase link` manually. The script handles it to prevent you from accidentally pushing test code to prod.
- **❌ Changing Applied Prefixes**: Once a migration is pushed, never rename the timestamp part of the filename.

> [!IMPORTANT]
> **Team Sync**: Always `git pull` before starting a new migration. If the script downloads a missing file from the remote, remember to commit it to your branch!
