'use client';

import type { EscoSkill } from '@/lib/types/skills';

type EscoSlimLabel = {
  uri: string;
  en: string;
  fr: string;
  alt_en: string[];
};

type ExtractSkillOptions = {
  maxSkills?: number;
  similarityThreshold?: number;
};

let labelsPromise: Promise<EscoSlimLabel[]> | null = null;

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 2);
}

async function loadEscoLabels(): Promise<EscoSlimLabel[]> {
  if (!labelsPromise) {
    // `redirect: 'error'` ensures we surface a real failure if a middleware
    // ever rewrites this away from the static file again, instead of silently
    // following the redirect into an HTML page.
    const pending = fetch('/esco-labels.json', { redirect: 'error' })
      .then(async (res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
          throw new Error('failed_to_load_esco_labels');
        }
        return (await res.json()) as EscoSlimLabel[];
      })
      .then((rows) => rows.filter((r) => !!r?.uri));

    pending.catch(() => {
      // Allow a fresh attempt on the next call instead of permanently caching
      // a rejected promise from a transient/middleware failure.
      if (labelsPromise === pending) labelsPromise = null;
    });

    labelsPromise = pending;
  }
  return labelsPromise;
}

function scoreTermAgainstCv(term: string, cvNormalized: string, cvTokens: Set<string>): number {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return 0;

  if (
    cvNormalized.includes(` ${normalizedTerm} `) ||
    cvNormalized.startsWith(`${normalizedTerm} `)
  ) {
    return 1;
  }

  const termTokens = tokenize(normalizedTerm);
  if (termTokens.length === 0) return 0;

  let overlap = 0;
  for (const token of termTokens) {
    if (cvTokens.has(token)) overlap += 1;
  }

  return overlap / termTokens.length;
}

function toProfileSkill(skill: EscoSlimLabel): EscoSkill {
  return {
    uri: skill.uri,
    preferredLabel: {
      en: skill.en,
      fr: skill.fr || skill.en,
    },
    description: { en: null, fr: null },
    skillType: null,
    reuseLevel: null,
    aliases: skill.alt_en,
  };
}

/**
 * Local, browser-only skill extraction from parsed CV text.
 * Uses cached ESCO labels and lexical similarity scoring.
 */
export async function extractSkillsFromCvText(
  cvText: string,
  _locale: 'en' | 'fr',
  options?: ExtractSkillOptions,
): Promise<EscoSkill[]> {
  const maxSkills = options?.maxSkills ?? 10;
  const similarityThreshold = options?.similarityThreshold ?? 0.72;

  const labels = await loadEscoLabels();
  const cvNormalized = ` ${normalizeText(cvText)} `;
  const cvTokens = new Set(tokenize(cvNormalized));

  const ranked = labels
    .map((label) => {
      const candidateTerms = [label.en, label.fr, ...(label.alt_en || [])].filter(Boolean);
      let bestScore = 0;
      for (const term of candidateTerms) {
        const score = scoreTermAgainstCv(term, cvNormalized, cvTokens);
        if (score > bestScore) bestScore = score;
      }
      return { label, score: bestScore };
    })
    .filter((row) => row.score >= similarityThreshold)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const extracted: EscoSkill[] = [];

  for (const row of ranked) {
    if (seen.has(row.label.uri)) continue;
    seen.add(row.label.uri);
    extracted.push(toProfileSkill(row.label));
    if (extracted.length >= maxSkills) break;
  }

  return extracted;
}
