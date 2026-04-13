# Supabase Backup

This folder contains scripts and instructions for backing up your Supabase database (public tables) for this project.

## How the Backup Script Works

- The `backup.js` script reads all migration `.sql` files in `supabase/migrations/` to discover the current set of tables (including dropped tables).
- It attempts to back up all tables in your Supabase project using the Supabase REST API and your service role key.
- Backups are saved as JSON files in `supabase/backups/`.
- On the Supabase free plan, only public tables can be backed up programmatically. Auth tables (like `auth.users`) and system tables are not accessible via the API.
- For user accounts, you must manually export `auth.users` from the Supabase dashboard (see below).

## How to Run a Backup

1. Ensure your `.env` file in the project root contains valid `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. Run the backup script from the project root:

   ```sh
   node supabase/backup.js
   ```

   - Backup files will be saved in `supabase/backups/`.

3. (Optional) Add a script to `package.json` for convenience:

   ```json
   "scripts": {
     "backup": "node supabase/backup.js"
   }
   ```

   Then run:

   ```sh
   npm run backup
   ```

## Exporting Users (auth.users)

- On the free plan, you cannot export `auth.users` programmatically.
- To export users:
  1. Go to the Supabase dashboard → Table Editor → `auth.users`.
  2. Select all rows and copy-paste into a spreadsheet (manual method).
  3. For full export/import, upgrade to a paid plan for direct Postgres access.

## Restore Notes

- To restore your app, import all public tables from the JSON files in `supabase/backups/`.
- If you have a backup of `auth.users`, you can restore user accounts; otherwise, users will need to re-register.
- For full disaster recovery (including all auth/system tables), a paid plan is required.

---

**Last updated:** February 2026
