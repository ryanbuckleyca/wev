# Skills-Based Matching Setup Guide

This document outlines the skills-based matching system implementation and setup steps.

## What Was Built

### 1. **Bilingual ESCO Skills Infrastructure** ✅

- **Migration**: `20260307170000_esco_skills_bilingual_reset.sql`
  - Table: `esco_skills` with EN/FR columns for labels, descriptions, scope notes
  - Function: `search_esco_skills(query, limit, locale)` - locale-aware search with fallback
  - Indexes on preferred labels and alternative labels (GIN)

- **Indexing Script**: `scripts/build_esco_skills_index.py`
  - Fetches skills from ESCO API (https://ec.europa.eu/esco/api)
  - Supports both EN and FR languages
  - Handles pagination, retries, and fallback recovery
  - Outputs to `supabase/seed/esco_skills_index.json`
  - Can upsert directly to Supabase with `--upsert-db` flag

### 2. **User Skills (Max 10)** ✅

- **Migration**: `20260306161200_profiles_skills_max_10.sql`
  - Constraint: `profiles.skills` max 10 concept URIs
  - Enforces a max of 10 concept URIs

- **UI Component**: `components/SkillsSelector.tsx`
  - Multi-select dropdown with search
  - Locale-aware (EN/FR)
  - Shows matched aliases, definitions, skill types
  - Enforces max 10 selection in UI

### 3. **Job Skills & Extended Matching** ✅

- **Migration**: `20260307180000_jobs_skills_and_extended_matching.sql`
  - Added `jobs.skills` column (max 10 concept URIs)
  - Extended `job_matches` table:
    - `value_score` (0-1, null if no values)
    - `skill_score` (0-1, null if no skills)
    - `shared_skills` (concept URIs array)
    - `score` (combined weighted score)
- **Matching Logic**:
  - **Value score**: `overlap + bonus` (bonus = min(shared_count \* 0.1, 0.3))
  - **Skill score**: same formula as values
  - **Combined score**:
    - Both signals: 60% values + 40% skills
    - Single signal: 100% of that signal
    - No signals: no match created

- **Triggers**: Fire only on `UPDATE OF values, skills` (not every profile/job save)

### 4. **Groq-Assisted Job Skill Tagging** ✅

- **API**: `POST /api/skills/extract`
  - Request: `{ text: string, locale?: 'en' | 'fr' }`
  - Response: `{ skills: string[] }` (concept URIs)
- **2-Stage Pipeline**:
  1. **DB Shortlist**: Extract keywords from text, search ESCO DB, build ~150 candidates
  2. **LLM Selection**: Send shortlist to Groq (llama-3.3-70b-versatile), get final max 10 skills
- **Benefits**:
  - Avoids sending 13k+ skills to LLM (token limit + cost)
  - Deterministic DB search + smart LLM filtering
  - Fast and cost-effective

## Setup Steps

### 1. Install Dependencies

```bash
cd wev-bulletin
npm install
```

This will install `groq-sdk@^0.8.0` added to `package.json`.

### 2. Set Environment Variables

Add to your `.env.test` (for wev-test) or `.env` (for wev-prod):

```bash
# Groq API Key (get from https://console.groq.com)
GROQ_API_KEY=gsk_...
```

### 3. Apply Database Migrations

```bash
# Apply to wev-test (default)
npx supabase db push

# Or apply to wev-prod (if ready)
# First update .env to point to prod, then:
# npx supabase db push
```

**Migrations to apply** (in order):

1. `20260306161000_profiles_skills.sql`
2. `20260306161200_profiles_skills_max_10.sql`
3. `20260307170000_esco_skills_bilingual_reset.sql`
4. `20260307180000_jobs_skills_and_extended_matching.sql`
5. `20260328000000_job_confidence_in_matching.sql`

### 4. Index ESCO Skills Data

Fetch and load bilingual ESCO skills from the API:

```bash
# Fetch from API and write JSON (takes ~5-10 min, fetches ~13k skills)
npm run skills:index -- --json-out supabase/seed/esco_skills_index.json

# Upsert to Supabase (wev-test by default)
npm run skills:index -- \
  --input-json supabase/seed/esco_skills_index.json \
  --upsert-db \
  --supabase-url $SUPABASE_URL \
  --supabase-key $SUPABASE_SERVICE_ROLE_KEY

# Or do both in one command:
npm run skills:index -- \
  --upsert-db \
  --supabase-url $SUPABASE_URL \
  --supabase-key $SUPABASE_SERVICE_ROLE_KEY
```

**Note**: The script reads env vars from `.env.test` or `.env` automatically if you don't pass flags.

### 5. Verify Setup

```bash
# Start dev server
npm run dev

# Test skills search API
curl "http://localhost:3000/api/skills/search?q=javascript&locale=en"

# Test skill extraction API (requires GROQ_API_KEY)
curl -X POST http://localhost:3000/api/skills/extract \
  -H "Content-Type: application/json" \
  -d '{"text":"Looking for a developer with JavaScript and React experience","locale":"en"}'
```

## Usage

### User Profile Skills

Users can select up to 10 skills on their profile page (`/profile`):

- Search by keyword (min 2 chars)
- Bilingual support (EN/FR)
- Shows skill definitions and types
- Auto-saves on profile update

### Job Skill Tagging (Future UI)

You'll need to build a UI for employers to tag jobs with skills. Two approaches:

**Option A: Manual Selection** (like user profile)

- Reuse `SkillsSelector` component
- Add to job creation/edit form
- Save to `jobs.skills` array

**Option B: AI-Assisted Extraction**

- Add "Extract from description" button
- Call `POST /api/skills/extract` with job description text
- Show suggested skills (pre-checked in selector)
- User confirms/adjusts before saving

### Matching Behavior

Matches recalculate automatically when:

- User updates their `values` or `skills` (profile save)
- Job updates its `values` or `skills` (job edit)

**Not triggered by**:

- Profile name/bio changes
- Job title/location changes (unless values/skills also change)

### Match Score Breakdown

Query `job_matches` to see:

- `score`: Combined weighted score (used for ranking)
- `value_score`: Match based on shared values (0-1 or null)
- `skill_score`: Match based on shared skills (0-1 or null)
- `shared_values`: Array of shared value strings
- `shared_skills`: Array of shared ESCO concept URIs

Example query:

```sql
SELECT
  jm.score,
  jm.value_score,
  jm.skill_score,
  array_length(jm.shared_values, 1) as values_count,
  array_length(jm.shared_skills, 1) as skills_count,
  j.title
FROM job_matches jm
JOIN jobs j ON j.id = jm.job_id
WHERE jm.user_id = auth.uid()
ORDER BY jm.score DESC
LIMIT 20;
```

## API Reference

### `GET /api/skills/search`

Search ESCO skills by keyword.

**Query Params**:

- `q` (required): Search query (min 2 chars)
- `limit` (optional): Max results (default 20, max 20)
- `locale` (optional): `en` or `fr` (default `en`)

**Response**:

```json
{
  "query": "javascript",
  "limit": 20,
  "locale": "en",
  "skills": [
    {
      "concept_uri": "http://data.europa.eu/esco/skill/...",
      "term": "JavaScript",
      "definition": "Programming language...",
      "scope_note": null,
      "skill_type": "skill",
      "reuse_level": "cross-sector",
      "matched_alias": null
    }
  ]
}
```

### `GET /api/skills/by-uri`

Fetch skills by concept URIs.

**Query Params**:

- `uris` (required): Comma-separated concept URIs
- `locale` (optional): `en` or `fr` (default `en`)

**Response**:

```json
{
  "skills": [
    {
      "concept_uri": "http://data.europa.eu/esco/skill/...",
      "term": "JavaScript",
      "definition": "...",
      "scope_note": null,
      "skill_type": "skill",
      "reuse_level": "cross-sector"
    }
  ]
}
```

### `GET /api/skills/starter`

Fetch the small starter list shown when the profile skills modal opens before the user types.

**Query Params**:

- `locale` (optional): `en` or `fr` (default `en`)
- `limit` (optional): maximum number of starter skills to return (default `10`, max `20`)

**Response**:

```json
{
  "locale": "en",
  "limit": 10,
  "skills": [
    {
      "concept_uri": "http://data.europa.eu/esco/skill/...",
      "term": "Archive documentation",
      "definition": "...",
      "scope_note": null,
      "skill_type": "skill",
      "reuse_level": "cross-sector",
      "matched_alias": null
    }
  ]
}
```

### `POST /api/skills/extract`

Extract relevant skills from job description or resume text using Groq LLM.

**Request Body**:

```json
{
  "text": "We are looking for a senior developer with 5+ years of JavaScript, React, and Node.js experience...",
  "locale": "en"
}
```

**Response**:

```json
{
  "skills": ["http://data.europa.eu/esco/skill/...", "http://data.europa.eu/esco/skill/..."]
}
```

**Error Response**:

```json
{
  "error": "GROQ_API_KEY environment variable is not set"
}
```

## Testing

Run tests:

```bash
npm test
```

Test files:

- `app/api/skills/search/route.test.ts`
- `app/api/skills/starter/route.test.ts`
- `app/api/skills/extract/route.test.ts`
- `app/[locale]/profile/page.test.tsx` (includes max 10 skills test)

## Next Steps

1. **Install dependencies**: `npm install`
2. **Set GROQ_API_KEY** in `.env.test`
3. **Apply migrations**: `npx supabase db push`
4. **Index ESCO skills**: `npm run skills:index -- --upsert-db`
5. **Build job tagging UI** (manual selector or AI-assisted extraction)
6. **Test matching** with real user/job data
7. **Monitor Groq usage** and adjust model/prompts if needed

## Notes

- **ESCO API**: We use it for indexing only, not runtime queries (for stability/performance)
- **Groq Model**: Using `llama-3.3-70b-versatile` (fast, accurate, cost-effective)
- **Max Skills**: Both users and jobs limited to 10 skills (enforced in DB + UI)
- **Matching Weight**: 60% values / 40% skills when both present (adjust in migration if needed)
- **Locale Fallback**: If FR label missing, falls back to EN (and vice versa)

## Troubleshooting

**"Cannot find module 'groq-sdk'"**

- Run `npm install` to install dependencies

**"GROQ_API_KEY environment variable is not set"**

- Get API key from https://console.groq.com
- Add to `.env.test`: `GROQ_API_KEY=gsk_...`

**"search_esco_skills function does not exist"**

- Apply migration `20260307170000_esco_skills_bilingual_reset.sql`
- Run `npx supabase db push`

**"esco_skills table is empty"**

- Run indexing script: `npm run skills:index -- --upsert-db`

**Matches not updating**

- Check triggers are attached: `\df trigger_recalculate_*` in psql
- Verify you're changing `values` or `skills` columns (not just other fields)
