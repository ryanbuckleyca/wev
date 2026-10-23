# Supabase Backups & Migrations

## Overview

This folder contains scripts and migrations for managing your Supabase database schema and data backups.

- **[migrations/](migrations/README.md)**: All migration .sql files (schema changes) are stored here.
- **[backup.md](backup.md)**: Backup scripts, restore documentation, and JSON snapshots are stored here.
- **[DATABASE_OBJECTIVES.md](./DATABASE_OBJECTIVES.md)**: Database mission statement, domain scope, and functional design requirements.

## Local Development (Full Setup)

The repository root contains a centralized Supabase configuration. To initialize, migate, and seed your local environment, run:

```bash
# From the repository root
npm run migrate
```

This command automatically:

1. Resets the local database (`supabase db reset`)
2. Applies all migrations in `supabase/migrations/`
3. Seeds the data using `supabase/seed-local.ts`
4. Regenerates TypeScript types into `wev-bulletin/lib/supabase/database.types.ts`

## Backups & Restores

For instructions on running backups, exporting users, and restoring tables, see [backup.md](backup.md).

---

For questions or improvements, see the script comments or contact the project maintainer.
