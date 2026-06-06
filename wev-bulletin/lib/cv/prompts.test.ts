import { describe, it, expect } from 'vitest';
import { buildPrompt, buildRerankPrompt, PROMPT_VERSION } from './prompts';

describe('cv prompts', () => {
  it('has a version number', () => {
    expect(PROMPT_VERSION).toBeGreaterThan(0);
  });

  describe('buildRerankPrompt', () => {
    const candidates = [
      { conceptUri: 'uri1', label: 'Skill 1', description: 'Desc 1' },
      { conceptUri: 'uri2', label: 'Skill 2', description: '' },
    ];

    it('builds english prompt', () => {
      const prompt = buildRerankPrompt('CV text', candidates, 5, 'en');
      expect(prompt).toContain('You are a strict skills assessor');
      expect(prompt).toContain('[uri1] Skill 1 — Desc 1');
      expect(prompt).toContain('[uri2] Skill 2');
      expect(prompt).toContain('Select up to 5 skills');
    });

    it('builds french prompt', () => {
      const prompt = buildRerankPrompt('CV text', candidates, 5, 'fr');
      expect(prompt).toContain('Tu evalues strictement les competences ESCO');
      expect(prompt).toContain('[uri1] Skill 1 — Desc 1');
      expect(prompt).toContain('JSON: {"selected": ["uri1", "uri2", ...]}');
    });

    it('truncates long CV text at word', () => {
      const longText = 'word '.repeat(1000);
      const prompt = buildRerankPrompt(longText, candidates, 5, 'en');
      // RERANK_CV_SNIPPET_CHARS is 3000
      expect(prompt.length).toBeLessThan(longText.length + 5000);
    });
  });

  describe('buildPrompt', () => {
    it('builds english extraction prompt', () => {
      const prompt = buildPrompt('CV text', 'en');
      expect(prompt).toContain('TASK A — NORMALIZED SKILLS');
      expect(prompt).toContain('TASK B — WORK VALUES');
      expect(prompt).toContain('Return JSON:');
    });

    it('builds french extraction prompt', () => {
      const prompt = buildPrompt('CV text', 'fr');
      expect(prompt).toContain('TACHE A - COMPETENCES NORMALISEES');
      expect(prompt).toContain('TACHE B - VALEURS AU TRAVAIL');
      expect(prompt).toContain('Retourne uniquement du JSON:');
    });

    it('truncates very long CV text', () => {
      const veryLongText = 'a'.repeat(20000);
      const prompt = buildPrompt(veryLongText, 'en');
      // MAX_TEXT_CHARS is 12000
      expect(prompt).toContain('a'.repeat(12000));
      expect(prompt).not.toContain('a'.repeat(12001));
    });
  });
});
