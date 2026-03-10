# Migration Guide

## ✅ Industry Standard Approach (Fixed!)

### ✅ DO - Use Our Migration Script
```bash
# Simple, environment-specific commands
./scripts/migrate.sh test    # Apply to test environment (uses .env)
./scripts/migrate.sh prod    # Apply to production (uses .env + .env.production)

# Dry run first (recommended)
MIGRATE_DRY_RUN=1 ./scripts/migrate.sh prod
```

### ✅ DO - Use Standard .env Files
```bash
# .env (development/local/test)
NEXT_PUBLIC_ENV_MODE=test
SUPABASE_URL=https://monvruedailbkcekicbl.supabase.co
SUPABASE_PROJECT_REF=monvruedailbkcekicbl  # For migrations
# ... all other env vars

# .env.production (production overrides only)
SUPABASE_PROJECT_REF=teuvfoftdjfsnkkbnzps  # Override for prod migrations
# Production-specific env vars would go here
```

### DO - Use Semantic Naming
```bash
# Good: Clear, descriptive, ordered
20260301_add_job_matches_table.sql
20260302_add_bookmarks_table.sql  
20260303_add_user_roles_index.sql
20260304_create_admin_profile.sql

# Bad: Vague, unclear purpose
20260301_migration.sql
20260301_fix.sql  # Same date = conflict!
```

### DO - Keep Applied Prefixes Stable
```bash
# Once a migration version has been applied remotely, do NOT change its
# numeric prefix. Supabase tracks migrations by that prefix, not by the
# descriptive suffix.

# Safe: improve suffix only while keeping the same applied prefix
20260306_create_esco_skills_index.sql

# Unsafe: changing the applied prefix creates a different migration version
202603061613_create_esco_skills_index.sql
```

Legacy note:
- `20260306_esco_skills_index.sql` uses an older short prefix format.
- Leave that applied prefix as-is unless you are intentionally repairing both local and remote migration history.
- For all new migrations, use a full sortable timestamp prefix such as `YYYYMMDDHHMM_description.sql`.

### DO - One Change Per Migration
```sql
-- GOOD: Single purpose
CREATE TABLE job_matches (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  score FLOAT NOT NULL CHECK (score >= 0 AND score <= 1),
  shared_values TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, job_id)
);

-- Include indexes in same migration
CREATE INDEX IF NOT EXISTS idx_job_matches_user_score ON job_matches(user_id, score DESC);
```

## ❌ DON'T - Old Anti-Patterns (Fixed!)

### ❌ Manual Linking Hell
```bash
# OLD - Don't do this anymore
supabase link --project-ref monvruedailbkcekicbl
supabase db push
supabase link --project-ref teuvfoftdjfsnkkbnzps  
supabase db push
# ✅ NEW: ./scripts/migrate.sh test/prod does this automatically!
```

### ❌ Environment File Confusion
```bash
# OLD - Multiple redundant env files
.env.local      # Development
.env.test       # Test (duplicate)
.env.production # Production
.env.staging    # Staging (another duplicate)

# ✅ NEW: Clean, standard approach
.env            # Development/Local/Test (primary)
.env.production # Production overrides only
```

### ❌ Manual SQL & Repair
```bash
# OLD - Bypasses migration tracking
psql - run SQL manually
supabase migration repair --status applied 20260227

# ✅ NEW: Let the script handle it
./scripts/migrate.sh test
```

## How Our Solution Works

### 🎯 **Automated Environment Switching**
```bash
#!/bin/bash
# The script automatically:
# 1. Links to correct project (test/prod)
# 2. Applies migrations
# 3. Reports success/failure

declare -A PROJECT_REFS=(
  ["test"]="monvruedailbkcekicbl"
  ["prod"]="teuvfoftdjfsnkkbnzps"
)
```

### 🎯 **Industry Comparison**

| Framework | Command | Environment Handling | Our Solution |
|-----------|---------|-------------------|--------------|
| **Rails** | `rails db:migrate` | `RAILS_ENV=test/production` | `./scripts/migrate.sh test/prod` ✅ |
| **Django** | `python manage.py migrate` | `--settings=settings.test` | `./scripts/migrate.sh test/prod` ✅ |
| **Prisma** | `prisma migrate deploy` | Environment-specific URLs | `./scripts/migrate.sh test/prod` ✅ |
| **Supabase** | `supabase db push` | Manual linking | `./scripts/migrate.sh test/prod` ✅ |

### 🎯 **Benefits of Our Approach**

✅ **No Manual Linking** - Script handles it automatically  
✅ **Clear Environment Separation** - `test` vs `prod` commands  
✅ **Dry Run Support** - Test before applying  
✅ **Error Handling** - Clear success/failure messages  
✅ **Industry Standard** - Matches Rails/Django patterns  

## Migration Best Practices

### 1. Use IF EXISTS
```sql
-- Safe to re-run
CREATE TABLE IF NOT EXISTS job_matches (...);
CREATE INDEX IF NOT EXISTS idx_job_matches_user_id ON job_matches(user_id);
```

### 2. Include RLS Policies
```sql
-- Always include row level security
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own job matches" ON job_matches
  FOR SELECT USING (auth.uid() = user_id);
```

### 3. Add Helpful Comments
```sql
-- Add job matching system
-- Tracks match scores between users and jobs based on shared values
-- Enables personalized job recommendations
```

## Troubleshooting

### Migration Conflicts
```bash
# Check status
supabase migration list

# Fix version conflicts
mv supabase/migrations/20260301.sql supabase/migrations/20260305.sql
```

### Partial Applied Migrations
```bash
# Tables exist but migration history is out of sync
./scripts/migrate.sh test  # Script handles this automatically
```

### Environment Issues
```bash
# Check which environment is linked
supabase projects list

# Verify script works
MIGRATE_DRY_RUN=1 ./scripts/migrate.sh test
MIGRATE_DRY_RUN=1 ./scripts/migrate.sh prod
```

## ✅ **Summary: We Fixed Migration Hell!**

**Before (Painful):**
- Manual linking: `supabase link --project-ref ...`
- Version conflicts: Same date migrations
- Environment confusion: Which am I linked to?
- Manual repairs: `supabase migration repair`

**After (Industry Standard):**
- Simple commands: `./scripts/migrate.sh test/prod`
- Automatic linking: Script handles it
- Clear environments: No confusion
- No manual repairs: Script handles edge cases

Our migration system now matches industry standards! �
