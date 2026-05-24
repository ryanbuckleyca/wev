import { CvImportError } from './errors';

const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v3';
const JINA_DIM = 1024;

async function retryAsync<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 1;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof CvImportError && error.message !== 'transient') {
        throw error;
      }
      if (attempt >= maxRetries) {
        throw new CvImportError('embedding_failed', error instanceof Error ? error.message : String(error));
      }
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
}

export async function embedPhrases(phrases: string[], apiKey: string): Promise<number[][]> {
  const validPhrases = phrases.map(p => p.trim()).filter(p => p.length > 0);
  if (validPhrases.length === 0) return [];

  const json = await retryAsync(async () => {
    const resp = await fetch(JINA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: JINA_MODEL,
        dimensions: JINA_DIM,
        task: 'retrieval.query',
        input: validPhrases,
      }),
      signal: AbortSignal.timeout(20_000), // Shorter timeout for faster retries
    });

    if (!resp.ok) {
      if ([429, 502, 503, 504].includes(resp.status)) {
        throw new CvImportError('embedding_failed', 'transient');
      }
      throw new CvImportError('embedding_failed', `jina_${resp.status}`);
    }

    return await resp.json() as any;
  });

  if (!json?.data || !Array.isArray(json.data)) {
    throw new CvImportError('jina_bad_response', 'Missing data array');
  }

  if (json.data.length !== validPhrases.length) {
    throw new CvImportError(
      'jina_misaligned_response',
      `Expected ${validPhrases.length} items, got ${json.data.length}`,
    );
  }

  const sorted = [...json.data].sort((a, b) => a.index - b.index);

  return sorted.map((item, i) => {
    if (item.index !== i) {
      throw new CvImportError(
        'jina_misaligned_response',
        `Index mismatch at position ${i}: expected ${i}, found ${item.index}`,
      );
    }
    if (
      !Array.isArray(item.embedding) ||
      item.embedding.length !== JINA_DIM ||
      !item.embedding.every(Number.isFinite)
    ) {
      throw new CvImportError('jina_bad_dimensions');
    }
    return item.embedding;
  });
}
