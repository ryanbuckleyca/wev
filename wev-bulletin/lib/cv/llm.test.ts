import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseLlmResponse, extractWithLlm } from './llm';
import { buildPrompt } from './prompts';
import Groq from 'groq-sdk';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('groq-sdk', () => {
  const MockGroq = vi.fn().mockImplementation(function (this: any) {
    this.chat = {
      completions: {
        create: mockCreate,
      },
    };
  });
  return {
    default: MockGroq,
    Groq: MockGroq,
  };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('llm-extractor', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  describe('buildPrompt', () => {
    it('truncates very long CV text', () => {
      const longText = 'a'.repeat(20000);
      const prompt = buildPrompt(longText);
      expect(prompt.length).toBeLessThan(25000);
    });

    it('includes values taxonomy and instructions', () => {
      const prompt = buildPrompt('Sample CV');
      expect(prompt).toContain('TASK A — NORMALIZED SKILLS');
      expect(prompt).toContain('TASK B — WORK VALUES');
      expect(prompt).toContain('Sample CV');
      expect(prompt).toContain('Return JSON');
      expect(prompt).toContain('Good outputs: "Team leadership"');
      expect(prompt).toContain('Bad outputs: "Led a team in water management"');
      expect(prompt).toContain('"evidence": "..."');
    });

    it('builds a French prompt when locale is fr and still requires canonical English values', () => {
      const prompt = buildPrompt('CV exemple', 'fr');
      expect(prompt).toContain("Tu analyses le CV d'une candidate ou d'un candidat");
      expect(prompt).toContain('TACHE A - COMPETENCES NORMALISEES');
      expect(prompt).toContain(
        'Valeurs autorisees: utilise exactement les libelles canoniques anglais',
      );
      expect(prompt).toContain('CV exemple');
      expect(prompt).toContain('- Advancement:');
      expect(prompt).toContain('"values": ["CanonicalEnglishValue1", ...]');
      expect(prompt).toContain('Mauvaises sorties: "Led a team in water management"');
      expect(prompt).toContain('"evidence": "..."');
    });
  });

  describe('parseLlmResponse', () => {
    it('parses well-formed JSON', () => {
      const raw =
        '{"skills": [{"phrase": "React development", "evidence": "Built React applications for public services", "prominence": 9}, {"phrase": "Node.js services", "evidence": "Maintained Node.js APIs", "prominence": 5}], "values": ["Advancement", "Independence"]}';
      const result = parseLlmResponse(raw);
      expect(result.skills).toHaveLength(2);
      expect(result.skills[0].phrase).toBe('React development');
      expect(result.skills[0].evidence).toContain('Built React applications');
      expect(result.values).toEqual(['Advancement', 'Independence']);
    });

    it('cleans up markdown formatting around JSON', () => {
      const raw =
        '```json\n{"skills": [{"phrase": "CSS architecture", "evidence": "Maintained CSS systems", "prominence": 3}], "values": ["Friendship"]}\n```';
      const result = parseLlmResponse(raw);
      expect(result.skills).toHaveLength(1);
    });

    it('handles legacy flat skill arrays by applying default prominence', () => {
      const raw = '{"skills": ["HTML", "CSS"], "values": []}';
      const result = parseLlmResponse(raw);
      expect(result.skills).toHaveLength(2);
      expect(result.skills[0].prominence).toBe(5);
      expect(result.skills[0].evidence).toBe('HTML');
    });

    it('filters out sentence-like skill phrases', () => {
      const raw =
        '{"skills": [{"phrase": "Led a team in water management", "evidence": "Led a team in water management", "prominence": 8}, {"phrase": "Team leadership", "evidence": "Led a team of six staff", "prominence": 8}], "values": []}';
      const result = parseLlmResponse(raw);
      expect(result.skills).toEqual([
        {
          phrase: 'Team leadership',
          evidence: 'Led a team of six staff',
          prominence: 8,
        },
      ]);
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
      const raw =
        '{"skills": [], "values": ["Advancement", "Independence", "Recognition", "Community", "Friendship", "Stability"]}';
      const result = parseLlmResponse(raw);
      expect(result.values).toHaveLength(5);
    });
  });

  describe('extractWithLlm', () => {
    const options = {
      cvText: 'CV text',
      groqKey: 'key',
      userId: 'u1',
      groqModel: 'model',
      locale: 'en' as const,
    };

    it('successfully extracts and parses response', async () => {
      const mockResult = {
        skills: [{ phrase: 'React Development', evidence: 'E1', prominence: 5 }],
        values: ['Advancement'],
      };
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(mockResult) } }],
      });

      const result = await extractWithLlm(options);
      expect(result.skills).toHaveLength(1);
      expect(result.values).toEqual(['Advancement']);
    });

    it('throws extraction_failed on generic error', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));
      await expect(extractWithLlm(options)).rejects.toThrow('extraction_failed');
    });

    it('rethrows CvImportError', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'invalid json' } }],
      });
      // We check for the code since the message is from JSON.parse
      try {
        await extractWithLlm(options);
      } catch (e: any) {
        expect(e.code).toBe('llm_parsing_failed');
      }
    });
  });
});
