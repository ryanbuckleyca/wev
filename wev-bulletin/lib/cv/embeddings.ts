import { CvImportError, TransientCvError } from './errors';

const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v3';
const JINA_DIM = 1024;
const MAX_RETRIES = 3;

export async function embedPhrases(phrases: string[], apiKey: string): Promise<number[][]> {
  const validPhrases = phrases.map((p) => p.trim()).filter((p) => p.length > 0);
  if (validPhrases.length === 0) return [];

  let attempt = 1;
  while (true) {
    try {
      const json = await fetchEmbeddings(validPhrases, apiKey);
      return parseEmbeddingResponse(json, validPhrases.length);
    } catch (error) {
      if (!(error instanceof TransientCvError)) throw error;
      if (attempt >= MAX_RETRIES) {
        throw new CvImportError(
          'embedding_failed',
          error instanceof Error ? error.message : String(error),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      attempt++;
    }
  }
}

async function fetchEmbeddings(phrases: string[], apiKey: string): Promise<unknown> {
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
      input: phrases,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!resp.ok) {
    if ([429, 502, 503, 504].includes(resp.status)) {
      throw new TransientCvError('embedding_failed', `transient_${resp.status}`);
    }
    throw new CvImportError('embedding_failed', `jina_${resp.status}`);
  }

  return resp.json();
}

function parseEmbeddingResponse(json: unknown, expectedCount: number): number[][] {
  const data = (json as any)?.data;

  if (!data || !Array.isArray(data)) {
    throw new CvImportError('jina_bad_response', 'Missing data array');
  }

  if (data.length !== expectedCount) {
    throw new CvImportError(
      'jina_misaligned_response',
      `Expected ${expectedCount} items, got ${data.length}`,
    );
  }

  if (data.some((item: any) => typeof item?.index !== 'number')) {
    throw new CvImportError('jina_bad_response', 'Missing or non-numeric index in response item');
  }

  const sorted = [...data].sort((a, b) => a.index - b.index);

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
