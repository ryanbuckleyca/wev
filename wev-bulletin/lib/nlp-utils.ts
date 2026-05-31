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

export function buildTokenSet(
  text: string,
  removeStopWords: boolean = true,
  locale: CvLocale = 'en',
): Set<string> {
  return new Set(tokenize(text, removeStopWords, locale));
}

/** Build a set of all lowercase words in the CV for fast lookup, supporting Unicode letters.
 *
 * Intentionally does NOT remove stop words — we keep the CV word set broad so
 * that `labelRelevance` can look up any word. Stop words are filtered on the
 * label side (in `labelRelevance`) where they carry no signal about relevance.
 */
export function buildCvWordSet(text: string, locale: CvLocale = 'en'): Set<string> {
  return new Set(tokenize(text, false, locale));
}

export function tokenCoverage(words: Iterable<string>, supportWords: Set<string>): number {
  const uniqueWords = Array.from(new Set(words));
  if (uniqueWords.length === 0) return 0;

  let hits = 0;
  for (const word of uniqueWords) {
    if (supportWords.has(word)) hits++;
  }
  return hits / uniqueWords.length;
}

export function textCoverage(
  text: string,
  supportWords: Set<string>,
  locale: CvLocale = 'en',
): number {
  return tokenCoverage(tokenize(text, true, locale), supportWords);
}

export function unsupportedTokenRatio(
  text: string,
  supportWords: Set<string>,
  locale: CvLocale = 'en',
): number {
  const uniqueWords = Array.from(new Set(tokenize(text, true, locale)));
  if (uniqueWords.length === 0) return 0;

  let misses = 0;
  for (const word of uniqueWords) {
    if (!supportWords.has(word)) misses++;
  }
  return misses / uniqueWords.length;
}

const TASK_LABEL_PREFIXES_EN = [
  'lead ',
  'manage ',
  'coordinate ',
  'assist ',
  'support ',
  'perform ',
  'carry out ',
  'work with ',
  'responsible for ',
];

const TASK_LABEL_PREFIXES_FR = [
  'diriger ',
  'gerer ',
  'coordonner ',
  'assister ',
  'soutenir ',
  'effectuer ',
  'realiser ',
  'travailler avec ',
  'responsable de ',
];

export function isTaskLikeText(text: string, locale: CvLocale = 'en'): boolean {
  const normalized = text.trim().toLowerCase();
  const tokens = tokenize(normalized, true, locale);

  if (tokens.length >= 7) return true;

  const prefixes = locale === 'fr' ? TASK_LABEL_PREFIXES_FR : TASK_LABEL_PREFIXES_EN;
  return prefixes.some((prefix) => normalized.startsWith(prefix));
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
  return textCoverage(escoLabel, cvWordsSet, locale);
}
