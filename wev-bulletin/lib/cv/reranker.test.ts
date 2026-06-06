import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGroqReranker, parseSelectedUris } from './reranker';
import Groq from 'groq-sdk';

vi.mock('groq-sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({ choices: [] }),
        },
      },
    })),
  };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('reranker - parseSelectedUris', () => {
  const validUris = new Set(['uri1', 'uri2', 'uri3']);

  it('successfully parses valid JSON with selected URIs', () => {
    const content = JSON.stringify({ selected: ['uri1', 'uri2'] });
    const result = parseSelectedUris(content, validUris, 5);
    expect(result).toEqual(['uri1', 'uri2']);
  });

  it('filters out invalid URIs', () => {
    const content = JSON.stringify({ selected: ['uri1', 'invalid', 'uri3'] });
    const result = parseSelectedUris(content, validUris, 5);
    expect(result).toEqual(['uri1', 'uri3']);
  });

  it('limits to max results', () => {
    const content = JSON.stringify({ selected: ['uri1', 'uri2', 'uri3'] });
    const result = parseSelectedUris(content, validUris, 2);
    expect(result).toEqual(['uri1', 'uri2']);
  });

  it('handles non-array selected field', () => {
    const content = JSON.stringify({ selected: 'not an array' });
    const result = parseSelectedUris(content, validUris, 5);
    expect(result).toEqual([]);
  });

  it('handles missing selected field', () => {
    const content = JSON.stringify({ other: 'field' });
    const result = parseSelectedUris(content, validUris, 5);
    expect(result).toEqual([]);
  });

  it('handles invalid JSON', () => {
    const result = parseSelectedUris('not json', validUris, 5);
    expect(result).toEqual([]);
  });

  it('skips non-string items in selected array', () => {
    const content = JSON.stringify({ selected: ['uri1', 123, null, 'uri2'] });
    const result = parseSelectedUris(content, validUris, 5);
    expect(result).toEqual(['uri1', 'uri2']);
  });

  it('avoids duplicate URIs', () => {
    const content = JSON.stringify({ selected: ['uri1', 'uri1', 'uri2'] });
    const result = parseSelectedUris(content, validUris, 5);
    expect(result).toEqual(['uri1', 'uri2']);
  });
});

describe('createGroqReranker', () => {
  it('returns empty array if no candidates', async () => {
    const reranker = createGroqReranker('key', 'model');
    const result = await reranker({
      candidates: [],
      cvText: 'text',
      locale: 'en',
      maxSkills: 5,
      userId: 'u1'
    });
    expect(result).toEqual([]);
  });
});
