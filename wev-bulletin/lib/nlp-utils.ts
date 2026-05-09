export const STOP_WORDS = new Set([
  // English
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'in',
  'to',
  'for',
  'on',
  'with',
  'by',
  'at',
  'is',
  'be',
  'as',
  'it',
  'its',
  'their',
  'that',
  'this',
  'from',
  'each',
  'other',
  'use',
  'using',
  'used',
  'manage',
  'apply',
  'ensure',
  'develop',
  'create',
  'provide',
  'support',
  'work',
  // French
  'un',
  'une',
  'le',
  'la',
  'les',
  'et',
  'ou',
  'de',
  'du',
  'des',
  'dans',
  'à',
  'au',
  'aux',
  'pour',
  'sur',
  'avec',
  'par',
  'est',
  'être',
  'comme',
  'il',
  'elle',
  'son',
  'sa',
  'ses',
  'leur',
  'leurs',
  'ce',
  'cette',
  'ces',
  'qui',
  'que',
  'quoi',
  'dont',
  'où',
  'utiliser',
  'utilisation',
  'gérer',
  'appliquer',
  'assurer',
  'développer',
  'créer',
  'fournir',
  'soutenir',
  'travail',
]);

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
