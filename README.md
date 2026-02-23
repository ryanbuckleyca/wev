# WEV Bulletin

A Next.js application for displaying job postings from a Supabase database with the ability to trigger GitHub Actions workflows for re-scraping data.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the project root (`/wev/.env`) that both projects can share:
```bash
# From the wev directory (project root)
cp .env.example .env
```

3. Fill in your environment variables in the root `.env` file:
- **wev-bulletin (Next.js)** — server-only (do not use `` for the key):
  - `SUPABASE_URL`: Your Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (used only in API routes; never exposed to the browser)
- **wev-scraper** (if using the same env): `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (or scraper-specific env)
- `GITHUB_TOKEN`: A GitHub personal access token with `actions:write` permission
- `GITHUB_REPO_OWNER`: Your GitHub username or organization
- `GITHUB_REPO_NAME`: The repository name (e.g., "wev")
- `GITHUB_WORKFLOW_ID`: The workflow file name (default: "scrape.yml")

**Note:** The Supabase service role key must never be prefixed with `` — it is only used server-side in wev-bulletin (e.g. `/api/bulletin`). The `.env` file can live in the project root so both apps can access it; Next.js can load from the parent directory.

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

## Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

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

# Server-side variables  
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### Northflank (Runtime)
Add the same environment variables to your Northflank service environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Why Both Locations?

- **GitHub Actions**: Needed during `npm run build` for Next.js to bundle Supabase clients correctly
- **Northflank**: Needed at runtime for the deployed app to make actual API calls to Supabase

The `NEXT_PUBLIC_*` variables are safe to expose to the client as they're designed for public operations only.
