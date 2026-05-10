import { eng, fra } from 'stopword';

export const STOP_WORDS = new Set([...eng, ...fra]);

/**
 * Lowercase, remove punctuation (keeping Unicode letters), split into words,
 * and filter by length (>= 3). Optionally removes stop words.
 */
export function tokenize(text: string, removeStopWords: boolean = false): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => {
      if (w.length < 3) return false;
      if (removeStopWords && STOP_WORDS.has(w)) return false;
      return true;
    });
}

/** Build a set of all lowercase words in the CV for fast lookup, supporting Unicode letters. */
export function buildCvWordSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/**
 * Compute how well an ESCO skill label matches the CV text.
 * Returns 0.0–1.0. A label like "lead a team in water management" gets
 * penalized when "water" never appears in the CV.
 */
export function labelRelevance(escoLabel: string, cvWordsSet: Set<string>): number {
  const labelWords = tokenize(escoLabel, true);

  if (labelWords.length === 0) return 1; // If only stop words, don't penalize

  let hits = 0;
  for (const w of labelWords) {
    if (cvWordsSet.has(w)) hits++;
  }
  return hits / labelWords.length;
}
