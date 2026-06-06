import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embedPhrases } from './embeddings';
import { CvImportError, TransientCvError } from './errors';

describe('embeddings - embedPhrases', () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  it('returns empty array for empty input', async () => {
    const result = await embedPhrases([], 'key');
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls Jina and returns embeddings on success', async () => {
    const mockEmbeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { index: 0, embedding: new Array(1024).fill(0.1) },
            { index: 1, embedding: new Array(1024).fill(0.2) },
          ],
        }),
    });

    const result = await embedPhrases(['p1', 'p2'], 'key');
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1024);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.jina.ai/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer key',
        }),
      }),
    );
  });

  it('retries on transient errors', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 502 }) // Transient
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ index: 0, embedding: new Array(1024).fill(0.1) }],
          }),
      });

    const promise = embedPhrases(['p1'], 'key');

    // Wait for the first failure
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws CvImportError on persistent transient errors', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });

    const promise = embedPhrases(['p1'], 'key');

    // Retry 1
    await vi.runAllTimersAsync();
    // Retry 2
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(CvImportError);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on non-transient error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 });

    await expect(embedPhrases(['p1'], 'key')).rejects.toThrow(CvImportError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('validates response structure', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'not an array' }),
    });
    await expect(embedPhrases(['p1'], 'key')).rejects.toThrow('Missing data array');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ index: 0, embedding: [0.1] }] }), // Wrong dimension
    });
    await expect(embedPhrases(['p1'], 'key')).rejects.toThrow('jina_bad_dimensions');
  });
});
