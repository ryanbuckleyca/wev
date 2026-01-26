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
- `SUPABASE_URL`: Your Supabase project URL (used by scraper)
- `SUPABASE_KEY`: Your Supabase service role key (used by scraper)
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL (used by Next.js)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_KEY`: Your Supabase anonymous key (used by Next.js)
- `GITHUB_TOKEN`: A GitHub personal access token with `actions:write` permission
- `GITHUB_REPO_OWNER`: Your GitHub username or organization
- `GITHUB_REPO_NAME`: The repository name (e.g., "wev")
- `GITHUB_WORKFLOW_ID`: The workflow file name (default: "scrape.yml")

**Note:** The `.env` file should be placed in the project root (`/wev/.env`) so both `wev-scraper` and `wev-bulletin` can access it. The Next.js app is configured to automatically load environment variables from the parent directory.

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
