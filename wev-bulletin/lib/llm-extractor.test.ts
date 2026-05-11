import { describe, it, expect } from 'vitest';
import { parseLlmResponse, type LlmResult } from './llm-extractor';
import { buildPrompt } from './prompts/cv-extraction';

describe('llm-extractor', () => {
  describe('buildPrompt', () => {
    it('truncates very long CV text', () => {
      const longText = 'a'.repeat(20000);
      const prompt = buildPrompt(longText);
      expect(prompt.length).toBeLessThan(25000);
    });

    it('includes values taxonomy and instructions', () => {
      const prompt = buildPrompt('Sample CV');
      expect(prompt).toContain('TASK A — SKILL PHRASES');
      expect(prompt).toContain('TASK B — WORK VALUES');
      expect(prompt).toContain('Sample CV');
      expect(prompt).toContain('Return JSON');
    });
  });

  describe('parseLlmResponse', () => {
    it('parses well-formed JSON', () => {
      const raw = '{"skills": [{"phrase": "React development", "prominence": 9}, {"phrase": "Node.js", "prominence": 5}], "values": ["Advancement", "Independence"]}';
      const result = parseLlmResponse(raw);
      expect(result.skills).toHaveLength(2);
      expect(result.skills[0].phrase).toBe('React development');
      expect(result.values).toEqual(['Advancement', 'Independence']);
    });

    it('cleans up markdown formatting around JSON', () => {
      const raw = '```json\n{"skills": [{"phrase": "CSS", "prominence": 3}], "values": ["Friendship"]}\n```';
      const result = parseLlmResponse(raw);
      expect(result.skills).toHaveLength(1);
    });

    it('handles legacy flat skill arrays by applying default prominence', () => {
      const raw = '{"skills": ["HTML", "CSS"], "values": []}';
      const result = parseLlmResponse(raw);
      expect(result.skills).toHaveLength(2);
      expect(result.skills[0].prominence).toBe(5);
    });

    it('filters out invalid or duplicate values', () => {
      const raw = '{"skills": [], "values": ["Advancement", "NotAValue", "Advancement"]}';
      const result = parseLlmResponse(raw);
      expect(result.values).toEqual(['Advancement']);
    });

    it('throws CvImportError on invalid JSON', () => {
      try {
        parseLlmResponse('definitely not json');
        expect.unreachable('Should have thrown');
      } catch (e: any) {
        expect(e.code).toBe('llm_parsing_failed');
      }
    });

    it('caps values to a maximum of 5', () => {
      const raw = '{"skills": [], "values": ["Advancement", "Independence", "Recognition", "Community", "Friendship", "Stability"]}';
      const result = parseLlmResponse(raw);
      expect(result.values).toHaveLength(5);
    });
  });
});
