import { describe, it, expect } from 'vitest';
import { buildCvWordSet, labelRelevance } from './nlp-utils';

describe('nlp-utils', () => {
  describe('buildCvWordSet', () => {
    it('tokenizes English text', () => {
      const cvText = 'Developed frontend web applications using React.';
      const set = buildCvWordSet(cvText);
      expect(set.has('developed')).toBe(true);
      expect(set.has('frontend')).toBe(true);
      expect(set.has('react')).toBe(true);
    });

    it('preserves French accents', () => {
      const cvText = "Développement d'applications Web frontend.";
      const set = buildCvWordSet(cvText);
      expect(set.has('développement')).toBe(true);
      expect(set.has('applications')).toBe(true);
      expect(set.has('web')).toBe(true);
      expect(set.has('frontend')).toBe(true);
      // d'applications becomes "d" and "applications". "d" is < 3 chars so it is filtered out.
      expect(set.has('d')).toBe(false);
    });
  });

  describe('labelRelevance', () => {
    it('scores 1.0 when all significant words match', () => {
      const cvText = 'Frontend web development using React and CSS';
      const cvSet = buildCvWordSet(cvText);
      const score = labelRelevance('web development', cvSet);
      expect(score).toBe(1.0);
    });

    it('scores 0.5 when half the significant words match', () => {
      const cvText = 'Frontend development using React';
      const cvSet = buildCvWordSet(cvText);
      // "development" is in cvSet, "backend" is not.
      const score = labelRelevance('backend development', cvSet);
      expect(score).toBe(0.5);
    });

    it('ignores stop words', () => {
      const cvText = 'Frontend development';
      const cvSet = buildCvWordSet(cvText);
      // "and" is a stop word, so it's ignored in the ESCO label.
      // The only significant word in the label is "development".
      const score = labelRelevance('development and', cvSet);
      expect(score).toBe(1.0);
    });

    it('scores 1.0 if the label only contains stop words', () => {
      const cvText = 'Frontend development';
      const cvSet = buildCvWordSet(cvText);
      const score = labelRelevance('to and from', cvSet);
      expect(score).toBe(1.0);
    });

    it('works correctly with French labels and accents', () => {
      const cvText = "J'ai fait beaucoup de développement logiciel.";
      const cvSet = buildCvWordSet(cvText);
      // "développement" and "logiciel" are both in cvSet. "de" is a stop word/short word.
      const score = labelRelevance('développement de logiciel', cvSet);
      expect(score).toBe(1.0);

      const score2 = labelRelevance('développement web', cvSet);
      // "développement" is present (1), "web" is missing (0)
      expect(score2).toBe(0.5);
    });
  });
});
