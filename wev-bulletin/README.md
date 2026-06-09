# WEV Bulletin

A Next.js application for displaying job postings from a Supabase database.

## UI Components

This project uses [shadcn/ui](https://ui.shadcn.com/) for UI components, which are built on Radix UI primitives and styled with Tailwind CSS.

### Installing Components

Components are installed individually using the shadcn CLI:

```bash
npx shadcn@latest add <component-name>
```

Example:

```bash
npx shadcn@latest add tooltip
npx shadcn@latest add button
```

Installed components are added to `components/ui/` and can be customized as needed. They're not imported from a package - they become part of your codebase.

### Component Guidelines

#### Core navigation building blocks

This application uses four related components for actions and navigation:

**Button Component**

- **Purpose:** Pure actions that don't navigate
- **Use for:** Form submission, modal triggers, API calls, state toggles, clipboard operations
- **Behavior:** Triggers onClick handlers, no navigation
- **Appearance:** Button styling with variants (primary, secondary, outline)

**LinkButton Component**

- **Purpose:** Navigation that looks like a button
- **Use for:** Page navigation where button appearance is desired
- **Behavior:** Navigates to a new page. **`prefetch` defaults to `false`** to avoid prefetching every visible target; pass **`prefetch={true}`** on routes where snappier navigation matters
- **Appearance:** Identical to Button component styling

**StyledLink Component** (`components/StyledLink.tsx`)

- **Purpose:** Navigation with shared link styling (primary, secondary, outline, text)
- **Use for:** Inline or compact nav (e.g. “Edit profile” in filters)
- **Behavior:** Same **`prefetch` default as `LinkButton`** (`false`, opt in with `prefetch={true}`)

**Link Component**

- **Purpose:** Navigation that looks like text (use `next/link` or, in this app, `Link` from `@/i18n/navigation` for locale-aware URLs)
- **Use for:** Text links within content, secondary navigation
- **Behavior:** Navigates to a new page. **`prefetch` follows Next.js defaults** unless you set `prefetch` explicitly (many auth screens omit it and get the framework default)
- **Appearance:** Text styling with underline on hover

#### Button Component

Use `<Button>` for actions that modify state or trigger events:

- Form submission (Save, Update, Delete)
- Modal/dropdown triggers
- API calls and workflows
- UI state toggles (theme, filters)
- Clipboard operations

```tsx
import Button from '@/components/Button'

// ✅ Correct: Form action
<Button type="submit">Save Profile</Button>

// ✅ Correct: API action
<Button onClick={handleCopy}>Copy to Clipboard</Button>

// ✅ Correct: Modal trigger
<Button onClick={() => setIsOpen(true)}>Open Modal</Button>
```

#### LinkButton Component

Use `<LinkButton>` for navigation between pages when button appearance is desired:

- Page navigation (Profile, Settings, Login)
- Primary navigation actions
- Any navigation that needs button styling
- **Prefetch:** defaults to **`false`**. Pass **`prefetch={true}`** when you want Next.js to prefetch that route (e.g. a primary destination users often open next)

```tsx
import LinkButton from '@/components/LinkButton'

// ✅ Correct: Page navigation with button appearance (no automatic prefetch)
<LinkButton href="/profile">View Profile</LinkButton>

// ✅ Correct: Opt in to prefetch for a hot path
<LinkButton href="/account-settings" prefetch={true}>
  Account Settings
</LinkButton>
```

#### StyledLink Component

`StyledLink` wraps the same i18n `Link` with shared styles; **`prefetch` defaults to `false`** for the same reasons as `LinkButton`. Use **`prefetch={true}`** when you explicitly want prefetching.

#### Link Component

Use `<Link>` (from `next/link`, or **`@/i18n/navigation`** in this app) for text-style navigation:

- Links within content paragraphs
- Secondary navigation
- Cross-references in help text
- **Prefetch:** Next.js default unless you pass `prefetch={false}` (some shell UI sets `prefetch={false}` to avoid redundant work)
- **Colors**: Muted Teal (unvisited) → Dusty Lavender (visited)

```tsx
import { Link } from '@/i18n/navigation'

// ✅ Correct: Text link (uses Next.js prefetch defaults for eligible routes)
<Link href="/account-settings" className="text-[var(--primary)] hover:underline visited:text-[var(--accent)]">
  Go to Account Settings
</Link>

// ✅ Correct: Explicit prefetch control
<p>
  Visit our{' '}
  <Link href="/help" prefetch={false} className="text-[var(--primary)] hover:underline visited:text-[var(--accent)]">
    help page
  </Link>{' '}
  for more info.
</p>
```

### Button Layout Best Practices

Follow our **left-secondary, right-primary** pattern for consistent UX:

#### Two-Button Layouts

```tsx
// ✅ Correct: Secondary on left, Primary on right
<div className="flex justify-between gap-3">
  <LinkButton href="/" variant="outline">
    Back to Jobs
  </LinkButton>
  <Button type="submit">Save Profile</Button>
</div>
```

#### Single Action Forms

```tsx
// ✅ Correct: Center single primary action
<div className="text-center">
  <Button type="submit">Submit</Button>
</div>
```

#### Layout Rules

- **Left side**: Secondary actions (cancel, back, navigate away)
- **Right side**: Primary actions (save, submit, confirm)
- **Spacing**: Use `gap-3` or `gap-4` for consistent spacing
- **Variants**: Outline/secondary for left, primary for right
- **Single actions**: Center align primary buttons

### Performance Features

- **Link prefetching:** `LinkButton` and `StyledLink` default to **`prefetch={false}`** so lists and menus do not trigger broad route prefetching. Opt in per link with **`prefetch={true}`** where it helps. Plain **`Link`** components use **Next.js defaults** unless `prefetch` is set (see [Next.js `Link` prefetching](https://nextjs.org/docs/app/api-reference/components/link#prefetch)).
- **Client-side Routing**: Uses Next.js router for SPA-like navigation
- **Semantic HTML**: Proper button/link elements for accessibility

## Setup

To get the project up and running locally, follow these steps:

### Prerequisites

Before you begin, ensure you have the following installed and running:

1.  **Node.js (>=22.22.2)**: As specified in `package.json`.
2.  **Python (>=3.10)**: Required for the `wev-scraper` project's scripts.
3.  **Docker Desktop**: Must be installed and running. Supabase local development relies on Docker containers.
4.  **Supabase CLI**: Install globally (`npm i -g supabase`) or ensure `npx supabase` is available in your PATH.

### Environment Variables

Create a `.env` file in the **root of your monorepo** (`/wev/.env`) that both projects can share. You can start by copying the example:

```bash
# From the monorepo root (e.g., /wev)
cp .env.example .env
```

Fill in your environment variables. The `wev-bulletin` project and its associated scripts require:

- **`SUPABASE_URL`**: Your local Supabase project URL (e.g., `http://127.0.0.1:54321`).
- **`SUPABASE_SERVICE_ROLE_KEY`**: Your Supabase service role key for your local instance. This can be found in your Supabase Studio or CLI output after `supabase start`. **Keep this secret.**
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
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### Northflank (Runtime)

Add the same environment variables to your Northflank service environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=https://bulletin.wevchange.org
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Why Both Locations?

- **GitHub Actions**: Needed during `npm run build` for Next.js to bundle Supabase clients correctly
- **Northflank**: Needed at runtime for the deployed app to make actual API calls to Supabase

The `NEXT_PUBLIC_*` variables are safe to expose to the client as they're designed for public operations only.
