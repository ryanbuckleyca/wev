import { eng, fra } from 'stopword';

const STOP_WORDS_EN = new Set(eng);
const STOP_WORDS_FR = new Set(fra);

function getStopWords(locale: 'en' | 'fr' = 'en'): Set<string> {
  return locale === 'fr' ? STOP_WORDS_FR : STOP_WORDS_EN;
}

/**
 * Lowercase, remove punctuation (keeping Unicode letters), split into words,
 * and filter by length (>= 3). Optionally removes stop words.
 */
export function tokenize(text: string, removeStopWords: boolean = false, locale: 'en' | 'fr' = 'en'): string[] {
  const stopWords = getStopWords(locale);
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => {
      if (w.length < 3) return false;
      if (removeStopWords && stopWords.has(w)) return false;
      return true;
    });
}

/** Build a set of all lowercase words in the CV for fast lookup, supporting Unicode letters. */
export function buildCvWordSet(text: string, locale: 'en' | 'fr' = 'en'): Set<string> {
  return new Set(tokenize(text, false, locale));
}

/**
 * Compute how well an ESCO skill label matches the CV text.
 * Returns 0.0–1.0. A label like "lead a team in water management" gets
 * penalized when "water" never appears in the CV.
 */
export function labelRelevance(escoLabel: string, cvWordsSet: Set<string>, locale: 'en' | 'fr' = 'en'): number {
  const labelWords = tokenize(escoLabel, true, locale);

  if (labelWords.length === 0) return 1; // If only stop words, don't penalize

  let hits = 0;
  for (const w of labelWords) {
    if (cvWordsSet.has(w)) hits++;
  }
  return hits / labelWords.length;
}
