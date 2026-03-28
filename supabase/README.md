# Supabase Backups & Migrations

## Overview

This folder contains scripts and migrations for managing your Supabase database schema and data backups.

- **migrations/**: All migration .sql files (schema changes) are stored here.
- **backups/**: All backup .json files are saved here by the backup script.
- **backup.js**: Script to back up all public tables (and attempts auth tables) to JSON files in backups/.

## How the Backup Script Works

- Parses all migration .sql files to discover current tables (including dropped tables).
- Attempts to back up each table using the Supabase REST API.
- Only public tables are backed up on the free plan; auth and system tables are not accessible.
- Backup files are saved as `backup_<schema>_<table>.json` in `supabase/backups/`.

## Running a Backup

1. Ensure your `.env` file in the project root contains valid `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. From the project root, run:

   ```sh
   node supabase/backup.js
   ```

   Or add this to your `package.json` scripts:

   ```json
   "scripts": {
     "backup:supabase": "node supabase/backup.js"
   }
   ```

   Then run:

   ```sh
   npm run backup:supabase
   ```

## Notes

- On the free plan, only public tables are backed up. You cannot programmatically back up `auth.users` or other system tables.
- For full database backup/restore (including users), you need a paid plan with direct Postgres access.
- To restore, you can re-import the JSON files into your tables using the Supabase dashboard or a custom script.

## Manual User Export

- To export users, use the Table Editor in the dashboard and manually copy rows from `auth.users` (no export button on free plan).

---

For questions or improvements, see the script comments or contact the project maintainer.
