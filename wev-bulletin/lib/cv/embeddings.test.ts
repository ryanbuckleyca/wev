import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embedPhrases } from './embeddings';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('vector-embedder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when given no phrases', async () => {
    const result = await embedPhrases([], 'fake-key');
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls Jina API and maps embeddings correctly', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: new Array(1024).fill(0.2) },
          { index: 0, embedding: new Array(1024).fill(0.1) },
        ],
      }),
    });

    const result = await embedPhrases(['phrase 0', 'phrase 1'], 'fake-key');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Check sorting by index
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe(0.1);
    expect(result[1][0]).toBe(0.2);
  });

  it('throws embedding_failed on non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await expect(embedPhrases(['test'], 'fake-key')).rejects.toThrowError('jina_401');
  });

  it('throws jina_bad_dimensions if embedding length is wrong', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [0.1, 0.2] }, // only 2 dims instead of 1024
        ],
      }),
    });

    await expect(embedPhrases(['test'], 'fake-key')).rejects.toThrowError('jina_bad_dimensions');
  });
});
