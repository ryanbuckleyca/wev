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

/** Build a set of all lowercase words in the CV for fast lookup, supporting Unicode letters. */
export function buildCvWordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

/**
 * Compute how well an ESCO skill label matches the CV text.
 * Returns 0.0–1.0. A label like "lead a team in water management" gets
 * penalized when "water" never appears in the CV.
 */
export function labelRelevance(escoLabel: string, cvWordsSet: Set<string>): number {
  const labelWords = escoLabel
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  if (labelWords.length === 0) return 1; // If only stop words, don't penalize

  let hits = 0;
  for (const w of labelWords) {
    if (cvWordsSet.has(w)) hits++;
  }
  return hits / labelWords.length;
}
