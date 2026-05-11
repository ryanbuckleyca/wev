import { CvImportError } from './errors';

const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v3';
const JINA_DIM = 1024;

export async function embedPhrases(phrases: string[], apiKey: string): Promise<number[][]> {
  if (phrases.length === 0) return [];

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
    signal: AbortSignal.timeout(60_000), // Consider lowering this + retries
  });

  if (!resp.ok) {
    throw new CvImportError('embedding_failed', `jina_${resp.status}`);
  }

  const json = (await resp.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((item) => {
    if (!Array.isArray(item.embedding) || item.embedding.length !== JINA_DIM) {
      throw new CvImportError('jina_bad_dimensions');
    }
    return item.embedding;
  });
}
