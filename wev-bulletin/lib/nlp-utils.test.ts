import { describe, it, expect } from 'vitest';
import { buildCvWordSet, labelRelevance, tokenize, isTaskLikeText } from './nlp-utils';

describe('nlp-utils', () => {
  describe('isTaskLikeText', () => {
    it('returns true for phrases with 8 or more tokens', () => {
      expect(isTaskLikeText('one two three four five six seven eight')).toBe(true);
      expect(isTaskLikeText('this is a very long phrase that should be considered a task description')).toBe(true);
    });

    it('returns false for phrases with fewer than 8 tokens', () => {
      expect(isTaskLikeText('one two three four five six seven')).toBe(false);
    });

    it('returns true for phrases starting with task prefixes', () => {
      expect(isTaskLikeText('led a team of developers')).toBe(true);
      expect(isTaskLikeText('managed project timelines')).toBe(true);
      expect(isTaskLikeText('dirige une équipe', 'fr')).toBe(true);
    });

    it('returns true for single-word task verbs (the bug)', () => {
      expect(isTaskLikeText('manage')).toBe(true);
      expect(isTaskLikeText('diriger', 'fr')).toBe(true);
    });

    it('returns false for normal skill phrases', () => {
      expect(isTaskLikeText('software development')).toBe(false);
      expect(isTaskLikeText('project management')).toBe(false);
      expect(isTaskLikeText('gestion de projet', 'fr')).toBe(false);
    });
  });

  describe('buildCvWordSet', () => {
    it('tokenizes English text', () => {
      const cvText = 'Developed frontend web applications using React.';
      const set = buildCvWordSet(cvText);
      expect(set.has('developed')).toBe(true);
      expect(set.has('frontend')).toBe(true);
      expect(set.has('react')).toBe(true);
    });

    it('preserves French accents and apostrophes', () => {
      const cvText = "Développement d'applications Web frontend.";
      const set = buildCvWordSet(cvText);
      expect(set.has('développement')).toBe(true);
      // d'applications is now kept as a single token (apostrophe preserved)
      expect(set.has("d'applications")).toBe(true);
      expect(set.has('web')).toBe(true);
      expect(set.has('frontend')).toBe(true);
    });
  });

  describe('tokenize tech tokens', () => {
    it('preserves C++ as cplusplus', () => {
      const tokens = tokenize('Experienced in C++ development');
      expect(tokens).toContain('cplusplus');
      expect(tokens).toContain('experienced');
      expect(tokens).toContain('development');
    });

    it('preserves C# as csharp', () => {
      const tokens = tokenize('Built APIs with C# and .NET');
      expect(tokens).toContain('csharp');
      expect(tokens).toContain('dotnet');
    });

    it('preserves F# as fsharp', () => {
      const tokens = tokenize('Functional programming in F#');
      expect(tokens).toContain('fsharp');
    });

    it('preserves digits in tokens like 3D, H2O, S3', () => {
      const tokens = tokenize('3D modelling and AWS S3 integration');
      expect(tokens).toContain('3d');
      expect(tokens).toContain('s3');
      expect(tokens).toContain('modelling');
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

    it('scores 0.0 if the label only contains stop words', () => {
      const cvText = 'Frontend development';
      const cvSet = buildCvWordSet(cvText);
      const score = labelRelevance('to and from', cvSet);
      expect(score).toBe(0.0);
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

    it('matches tech tokens between CV and ESCO labels', () => {
      const cvText = 'Proficient in C++ and .NET framework';
      const cvSet = buildCvWordSet(cvText);
      const score = labelRelevance('C++ development', cvSet);
      expect(score).toBe(0.5); // "cplusplus" matches, "development" doesn't
    });
  });
});
