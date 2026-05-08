#!/usr/bin/env node
// Builds public/esco-labels.json (slim shape used by the client-side CV skill
// extractor) from the canonical seed at supabase/seed/esco_skills_index.json.
//
// Run from the wev-bulletin directory:
//   node scripts/build-esco-labels.mjs
//
// The slim shape is documented in lib/cv-skills-extractor.ts.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const SRC = resolve(repoRoot, 'supabase/seed/esco_skills_index.json');
const DST = resolve(here, '..', 'public/esco-labels.json');

const raw = await readFile(SRC, 'utf-8');
const data = JSON.parse(raw);

const slim = [];
for (const s of data.skills ?? []) {
  const uri = s?.concept_uri;
  if (!uri) continue;
  const pl = s.preferred_label ?? {};
  const al = s.alternative_label ?? {};
  slim.push({
    uri,
    en: (pl.en ?? '').trim(),
    fr: (pl.fr ?? '').trim(),
    alt_en: (al.en ?? []).filter(Boolean),
  });
}

await mkdir(dirname(DST), { recursive: true });
await writeFile(DST, JSON.stringify(slim));

const srcKb = Buffer.byteLength(raw) / 1024;
const dstKb = Buffer.byteLength(JSON.stringify(slim)) / 1024;
console.log(
  `Wrote ${slim.length} entries to ${DST} (${(dstKb / 1024).toFixed(2)} MB, source ${(srcKb / 1024).toFixed(2)} MB)`,
);
