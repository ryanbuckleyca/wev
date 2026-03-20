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

---

## ❌ Anti-Patterns to Avoid

- **❌ Manual Dashboard SQL**: Never run schema-changing SQL in the Supabase Dashboard. If it's not in a `.sql` file, the team can't sync it.
- **❌ Manual Project Linking**: Don't use `supabase link` manually. The script handles it to prevent you from accidentally pushing test code to prod.
- **❌ Changing Applied Prefixes**: Once a migration is pushed, never rename the timestamp part of the filename.

> [!IMPORTANT]
> **Team Sync**: Always `git pull` before starting a new migration. If the script downloads a missing file from the remote, remember to commit it to your branch!
