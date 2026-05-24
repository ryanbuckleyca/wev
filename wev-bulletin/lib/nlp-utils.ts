import { eng, fra } from 'stopword';
import type { CvLocale } from '@/lib/cv/types';

const STOP_WORDS_EN = new Set(eng);
const STOP_WORDS_FR = new Set(fra);

function getStopWords(locale: CvLocale = 'en'): Set<string> {
  return locale === 'fr' ? STOP_WORDS_FR : STOP_WORDS_EN;
}

/**
 * Common technical tokens that contain symbols stripped by general punctuation
 * removal. Mapped to safe alphanumeric slugs so they survive tokenization and
 * can be matched consistently between CV text and ESCO labels.
 *
 * Order matters — longer patterns must come first so e.g. "c++" is matched
 * before "c+" would be (if we ever added one).
 */
const TECH_TOKEN_MAP: [RegExp, string][] = [
  [/\bc\+\+/gi, 'cplusplus'],
  [/\bf#/gi, 'fsharp'],
  [/\bc#/gi, 'csharp'],
  [/\.net\b/gi, 'dotnet'],
];

/**
 * Lowercase, normalize tech tokens, remove punctuation (keeping Unicode
 * letters, digits, apostrophes, hyphens), split into words, and filter by
 * length (>= 2). Optionally removes stop words.
 */
export function tokenize(
  text: string,
  removeStopWords: boolean = false,
  locale: CvLocale = 'en',
): string[] {
  const stopWords = getStopWords(locale);

  // Normalize well-known tech tokens before stripping symbols
  let normalized = text.toLowerCase();
  for (const [pattern, replacement] of TECH_TOKEN_MAP) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/[^\p{L}\p{N}'\-\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => {
      if (w.length < 2) return false;
      if (removeStopWords && stopWords.has(w)) return false;
      return true;
    });
}

/** Build a set of all lowercase words in the CV for fast lookup, supporting Unicode letters. */
export function buildCvWordSet(text: string, locale: CvLocale = 'en'): Set<string> {
  return new Set(tokenize(text, false, locale));
}

/**
 * Compute how well an ESCO skill label matches the CV text.
 * Returns 0.0–1.0. A label like "lead a team in water management" gets
 * penalized when "water" never appears in the CV.
 */
export function labelRelevance(
  escoLabel: string,
  cvWordsSet: Set<string>,
  locale: CvLocale = 'en',
): number {
  const labelWords = tokenize(escoLabel, true, locale);

  if (labelWords.length === 0) return 0; // If only stop words, we have no evidence of relevance

  let hits = 0;
  for (const w of labelWords) {
    if (cvWordsSet.has(w)) hits++;
  }
  return hits / labelWords.length;
}
