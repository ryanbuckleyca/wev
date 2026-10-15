# WEV Bulletin

A Next.js application for displaying job postings from a Supabase database.

## UI Components

Component installation, guidelines, button layout best practices, and prefetching conventions are documented in [components/README.md](components/README.md).

## Setup

To get the project up and running locally, follow these steps:

### Prerequisites

Before you begin, ensure you have the following installed and running:

1.  **Node.js (>=22.22.2)**: As specified in `package.json`.
2.  **Python (>=3.10)**: Required for the `wev-scraper` project's scripts.
3.  **Docker Desktop**: Must be installed and running. Supabase local development relies on Docker containers.
4.  **Supabase CLI**: Install globally (`npm i -g supabase`) or ensure `npx supabase` is available in your PATH.

> **Windows users:** The `install:scraper-deps`, `prep`, and `setup` npm scripts rely on Unix shell features (`(cd ... && ...)`, `yes |`, `$VAR`). Run them from WSL, Git Bash, or a Docker-based environment; native PowerShell/cmd is not supported.

### Environment Variables

Create a `.env` file in the **root of your monorepo** (`/wev/.env`) that both projects can share. You can start by copying the example:

```bash
# From the monorepo root (e.g., /wev)
cp .env.example .env
```

Fill in your environment variables. The `wev-bulletin` project and its associated scripts require:

- **`SUPABASE_URL`**: Your local Supabase project URL (e.g., `http://127.0.0.1:54321`).
- **`SUPABASE_SECRET_KEY`**: Your Supabase secret key (`sb_secret_…`) for your local instance. This can be found in your Supabase Studio or CLI output after `supabase start`. **Keep this secret.**
- **`WEV_GITHUB_TOKEN`**: A GitHub personal access token with `actions:write` permission (as detailed in the "GitHub Token Setup" section below).

**Note:** The `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PROJECT_REF` are now derived internally by scripts, so you only need to explicitly set `SUPABASE_URL` for local development.

### One-Step Local Development Setup

Navigate to the `wev-bulletin` directory and run the comprehensive setup script:

```bash
cd wev-bulletin
npm run setup
```

This single command performs the following operations:

1.  **`npm install`**: Installs all Node.js dependencies for the `wev-bulletin` project.
2.  **`npm run install:scraper-deps`**: Installs all Python dependencies for the `wev-scraper` project.
3.  **`npm run prep`**:
    _ **`npx supabase start`**: Starts your local Supabase services (requires Docker Desktop).
    _ **`yes | npx supabase db reset`**: Resets your local Supabase database, applies all migrations from scratch, and runs any SQL seed scripts (`supabase/seed.sql`). The `yes |` automatically confirms the reset prompt.
    _ **`npm run db:seed-local`**: Seeds your local database with deterministic job postings and other data using programmatic seeding defined in `supabase/src/seeder.ts`.
    _ **`npm run skills:index`**: Fetches ESCO skills, generates embeddings, and upserts them into your Supabase database.

### Running the Development Server

After the setup is complete, you can start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema

The application expects two tables in Supabase:

### `jobs`

- `id` (uuid, primary key)
- `source_id` (uuid, foreign key to sources table)
- `job_title` (text)
- `organization` (text)
- `location` (text)
- `date_posted` (date or timestamp)
- `close_date` (date or timestamp, nullable)
- `wage` (text, nullable)
- `listing_url` (text)
- `description` (text)
- `employment_type` (text)
- `scraped_at` (timestamp)

### `scrape_runs`

- `id` (uuid, primary key)
- `source_id` (uuid, foreign key to sources table)
- `jobs_found` (integer)
- `jobs_added` (integer)
- `errors` (text, nullable)
- `run_at` (timestamp)

### `job_matches`

Stores user↔job **work-values** match scores (`user_id`, `job_id`, `score`, `shared_values`). Implementation and tests live in this repo: **`lib/match-calculator.ts`**, **`lib/value-ratings.ts`**, **`lib/match-calculator.test.ts`**, **`lib/sql-ts-parity.test.ts`**. Database triggers and functions are defined in **`supabase/migrations/`** at the repository root.

For **scraper scripts** that touch matching or bulk recompute, see **`wev-scraper/scripts/README.md`** (not duplicated here).

## Features

- Display last scrape time from the `scrape_runs` table`
- Trigger GitHub Actions workflows to re-scrape data
- Display job postings in a clean, readable format
- Automatic data refresh after workflow completion
- Loading states, error handling, and empty states

## GitHub Token Setup

To create a GitHub personal access token:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with the `repo` scope (or `actions:write` if using fine-grained tokens)
3. Add the token to your `.env.local` file

## Deployment

### Environment Variables Setup

This application requires environment variables in **both GitHub Actions (build time)** and **Northflank (runtime)**:

#### GitHub Actions (Build Time)

Add these secrets to your repository → Settings → Secrets and variables → Actions:

```bash
# Client-side variables (needed for build/middleware)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
# Auth email links (signup, password reset) redirect here. Set to production URL so links work even when testing from localhost.
NEXT_PUBLIC_SITE_URL=https://bulletin.wevchange.org

# Server-side variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
```

#### Northflank (Runtime)

Add the same environment variables to your Northflank service environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=https://bulletin.wevchange.org
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
```

### Why Both Locations?

- **GitHub Actions**: Needed during `npm run build` for Next.js to bundle Supabase clients correctly
- **Northflank**: Needed at runtime for the deployed app to make actual API calls to Supabase

The `NEXT_PUBLIC_*` variables are safe to expose to the client as they're designed for public operations only.
