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
 * length (>= 3). Optionally removes stop words.
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
      if (w.length < 3) return false;
      if (removeStopWords && stopWords.has(w)) return false;
      return true;
    });
}

/**
 * Build a set of all lowercase words in the CV for fast lookup, supporting Unicode letters.
 *
 * Intentionally does NOT remove stop words — we keep the CV word set broad so
 * that `labelRelevance` can look up any word. Stop words are filtered on the
 * label side (in `labelRelevance`) where they carry no signal about relevance.
 */
export function buildCvWordSet(text: string, locale: CvLocale = 'en'): Set<string> {
  return new Set(tokenize(text, false, locale));
}

/**
 * Build a set of content-word bigrams from the CV text.
 * Stop words and short words (<3 chars) break the bigram chain so only
 * truly adjacent content words form compounds (e.g. "project management",
 * "systems thinking"). This prevents false compounds like "team project"
 * from "team of 13 on project".
 */
export function buildCvBigramSet(text: string, locale: CvLocale = 'en'): Set<string> {
  const stopWords = getStopWords(locale);
  const allWords = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/);

  const bigrams = new Set<string>();
  let prev: string | null = null;
  for (const word of allWords) {
    if (word.length < 3 || stopWords.has(word)) {
      prev = null;
      continue;
    }
    if (prev !== null) {
      bigrams.add(`${prev} ${word}`);
    }
    prev = word;
  }
  return bigrams;
}

/**
 * Build content-word bigrams from an ESCO label using the same chain-breaking
 * logic as buildCvBigramSet. Returns an empty array when the label has fewer
 * than 2 content words adjacent to each other.
 */
function labelBigrams(escoLabel: string, locale: CvLocale): string[] {
  const stopWords = getStopWords(locale);
  const allWords = escoLabel
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/);

  const bigrams: string[] = [];
  let prev: string | null = null;
  for (const word of allWords) {
    if (word.length < 3 || stopWords.has(word)) {
      prev = null;
      continue;
    }
    if (prev !== null) {
      bigrams.push(`${prev} ${word}`);
    }
    prev = word;
  }
  return bigrams;
}

/**
 * Compute how well an ESCO skill label matches the CV text.
 * Returns 0.0–1.0.
 *
 * When a bigram set is provided and the label contains compound terms
 * (adjacent content words like "water management"), the score blends
 * individual word overlap (30%) with compound overlap (70%).
 * This penalizes domain-specific ESCO labels whose qualifying compound
 * is absent from the CV (e.g. "lead a team in water management" when
 * the CV never mentions "water management").
 *
 * Falls back to word-only scoring when no bigrams are available or
 * when the label has no compound terms.
 */
export function labelRelevance(
  escoLabel: string,
  cvWordsSet: Set<string>,
  locale: CvLocale = 'en',
  cvBigrams?: Set<string>,
): number {
  const labelWords = tokenize(escoLabel, true, locale);

  // If only stop words, don't penalize — no evidence either way
  if (labelWords.length === 0) return 1;

  let hits = 0;
  for (const w of labelWords) {
    if (cvWordsSet.has(w)) hits++;
  }
  const wordOverlap = hits / labelWords.length;

  // When bigrams are available, check compound-term overlap
  if (cvBigrams) {
    const compounds = labelBigrams(escoLabel, locale);
    if (compounds.length > 0) {
      const bigramHits = compounds.filter((bg) => cvBigrams.has(bg)).length;
      const bigramOverlap = bigramHits / compounds.length;
      return wordOverlap * 0.3 + bigramOverlap * 0.7;
    }
  }

  return wordOverlap;
}
