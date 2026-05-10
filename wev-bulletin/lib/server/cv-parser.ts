import 'server-only';
import { CvImportError } from '@/lib/types/cv-errors';
import type { CvImportMetadata } from '@/lib/types/cv';

export type ParsedCvResult = {
  text: string;
  metadata: CvImportMetadata;
};

const PDF_MIN_TEXT_CHARS_BEFORE_OCR = 80;

function normalizeText(input: string): string {
  return input
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractPdfTextLayer(pdf: any): Promise<string> {
  const pages: string[] = [];
  let totalChars = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str ?? '').join(' ');
    pages.push(pageText);
    totalChars += pageText.trim().length;

    // Circuit breaker for empty documents
    if (pageNumber === 3 && totalChars === 0 && pdf.numPages > 3) {
      break;
    }
  }
  return normalizeText(pages.join('\n'));
}

/**
 * Server-side PDF parser using pdfjs-dist.
 * Uses dynamic import to avoid Turbopack bundling issues with the worker.
 */
async function parsePdfText(buffer: Buffer): Promise<string> {
  // Dynamic import avoids Turbopack trying to resolve pdf.worker at bundle time
  const pdfjs = await import(
    /* webpackIgnore: true */
    'pdfjs-dist/legacy/build/pdf.mjs'
  );

  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const text = await extractPdfTextLayer(pdf);

    if (text.length < PDF_MIN_TEXT_CHARS_BEFORE_OCR) {
      throw new CvImportError('pdf_no_text_layer');
    }
    return text;
  } catch (error) {
    if (error instanceof CvImportError) throw error;
    throw new CvImportError('cvImportFailed', error instanceof Error ? error.message : undefined);
  }
}

async function parseDocxText(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.default.extractRawText({ buffer });
    return normalizeText(result.value || '');
  } catch (error) {
    throw new CvImportError('cvImportFailed', error instanceof Error ? error.message : undefined);
  }
}

export async function parseCvOnServer(
  file: File,
  locale: 'en' | 'fr'
): Promise<ParsedCvResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name;
  const type = file.type;
  const extension = name.toLowerCase().split('.').pop();

  let text = '';
  if (extension === 'pdf' || type === 'application/pdf') {
    text = await parsePdfText(buffer);
  } else if (extension === 'docx' || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    text = await parseDocxText(buffer);
  } else {
    throw new CvImportError('unsupported_file_type');
  }

  if (!text) {
    throw new CvImportError('no_extractable_text');
  }

  return {
    text,
    metadata: {
      filename: name,
      imported_at: new Date().toISOString(),
      source: 'cv_upload',
      locale,
    },
  };
}
