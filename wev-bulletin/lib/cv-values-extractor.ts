'use client';

import { VALUES_LIST, getValueDefinition } from '@/lib/values';

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'your',
  'their',
  'work',
  'jobs',
  'job',
  'dans',
  'avec',
  'pour',
  'les',
  'des',
  'une',
  'sur',
  'par',
  'qui',
  'est',
  'du',
  'de',
  'la',
  'le',
]);

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
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

type ScoredValue = { id: string; score: number };

/**
 * Local heuristic value inference from CV text.
 * No network calls, no model APIs.
 */
export function inferValuesFromCvText(
  cvText: string,
  _locale: 'en' | 'fr',
  limit: number,
): string[] {
  const normalizedCv = ` ${normalizeText(cvText)} `;
  const cvTokens = new Set(tokenize(cvText));

  const scored: ScoredValue[] = VALUES_LIST.map((id) => {
    const def = getValueDefinition(id);
    const phraseCandidates = [id, def.description, def.example];
    const keywords = new Set(tokenize(phraseCandidates.join(' ')));

    let score = 0;

    for (const phrase of phraseCandidates) {
      const p = normalizeText(phrase);
      if (p.length > 0 && normalizedCv.includes(` ${p} `)) {
        score += 1.25;
      }
    }

    for (const keyword of keywords) {
      if (cvTokens.has(keyword)) {
        score += 0.2;
      }
    }

    return { id, score };
  })
    .filter((row) => row.score >= 0.6)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return scored.slice(0, limit).map((row) => row.id);
}
