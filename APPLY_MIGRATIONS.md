# Apply Migrations to Supabase

Since `npx supabase db push` hangs and the REST API doesn't support executing SQL, you need to apply migrations manually via the Supabase Dashboard.

## Steps

1. **Open Supabase SQL Editor**:
   https://supabase.com/dashboard/project/monvruedailbkcekicbl/sql

2. **Apply migrations in this order** (copy/paste each file's contents and click "Run"):

### Migration 1: Bilingual ESCO Skills Table
**File**: `supabase/migrations/202603071700_esco_skills_bilingual_reset.sql`

⚠️ **Warning**: This drops and recreates the `esco_skills` table.

```sql
-- Copy contents from: supabase/migrations/202603071700_esco_skills_bilingual_reset.sql
```

### Migration 2: User Skills Max 10 Constraint
**File**: `supabase/migrations/202603061612_profiles_skills_max_10.sql`

```sql
-- Copy contents from: supabase/migrations/202603061612_profiles_skills_max_10.sql
```

### Migration 3: Jobs Skills & Extended Matching
**File**: `supabase/migrations/202603071800_jobs_skills_and_extended_matching.sql`

```sql
-- Copy contents from: supabase/migrations/202603071800_jobs_skills_and_extended_matching.sql
```

## After Applying Migrations

Run the ESCO skills indexing script to populate the database:

```bash
cd wev-bulletin
npm run skills:index -- --upsert-db
```

This will:
1. Fetch ~13k skills from ESCO API (EN + FR)
2. Upsert them to your Supabase database

The script will take 5-10 minutes to complete.

## Verify

Test the skills search API:
```bash
curl "http://localhost:3000/api/skills/search?q=javascript&locale=en"
```

Test the skill extraction API:
```bash
curl -X POST http://localhost:3000/api/skills/extract \
  -H "Content-Type: application/json" \
  -d '{"text":"Looking for a developer with JavaScript experience","locale":"en"}'
```
