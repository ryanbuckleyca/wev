'use client';

export type { CvImportMetadata } from '@/lib/types/cv';
import type { CvImportMetadata } from '@/lib/types/cv';

export type ParsedCvResult = {
  text: string;
  metadata: CvImportMetadata;
};

const MB = 1024 * 1024;
export const MAX_CV_FILE_SIZE_BYTES = 6 * MB;
const PDF_MIN_TEXT_CHARS_BEFORE_OCR = 80;
const OCR_MAX_PAGES = 5;
const OCR_RENDER_SCALE = 1.75;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function normalizeText(input: string): string {
  return input
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLowercaseExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

export function validateCvFile(file: File): void {
  const ext = getLowercaseExtension(file.name);
  const mimeOk = ALLOWED_MIME_TYPES.has(file.type);
  const extOk = ext === '.pdf' || ext === '.docx';

  if (!mimeOk && !extOk) {
    throw new Error('unsupported_file_type');
  }

  if (file.size <= 0) {
    throw new Error('empty_file');
  }

  if (file.size > MAX_CV_FILE_SIZE_BYTES) {
    throw new Error('file_too_large');
  }
}

function readWithFileReader(file: File): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('file_read_failed'));
    reader.onabort = () => reject(new Error('file_read_failed'));
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
      } else {
        reject(new Error('file_read_failed'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch {
    try {
      return await readWithFileReader(file);
    } catch (error) {
      throw mapFileReadError(error);
    }
  }
}

function mapFileReadError(error: unknown): Error {
  if (
    error instanceof DOMException &&
    (error.name === 'NotReadableError' ||
      error.name === 'SecurityError' ||
      error.name === 'NotAllowedError')
  ) {
    return new Error('file_read_failed');
  }
  return error instanceof Error ? error : new Error('cvImportFailed');
}

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (params: { scale: number }) => { width: number; height: number };
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    render: (params: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void> };
  }>;
};

type PdfJsModule = {
  version?: string;
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: {
    data: ArrayBuffer;
    disableWorker?: boolean;
    isEvalSupported?: boolean;
  }) => {
    promise: Promise<PdfDocument>;
  };
};

let cachedPdfJs: PdfJsModule | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (process.env.VITEST === 'true') {
    return (globalThis as any).MOCK_PDFJS;
  }
  if (cachedPdfJs) return cachedPdfJs;
  const pdfjs = (await import(/* @vite-ignore */ 'pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule;

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const version = pdfjs.version ?? '5.4.296';
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/legacy/build/pdf.worker.min.mjs`;
  }

  cachedPdfJs = pdfjs;
  return pdfjs;
}

async function extractPdfTextLayer(pdf: PdfDocument): Promise<string> {
  const pages: string[] = [];
  let totalChars = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: { str?: string }) => item.str ?? '').join(' ');
    pages.push(pageText);
    totalChars += pageText.trim().length;

    // Circuit breaker: if first 3 pages are empty, skip further text layer extraction
    // and let the caller decide if OCR is needed.
    if (pageNumber === 3 && totalChars === 0 && pdf.numPages > 3) {
      break;
    }
  }
  return normalizeText(pages.join('\n'));
}

async function extractPdfOcr(pdf: PdfDocument): Promise<string> {
  const tesseract = (await import('tesseract.js')) as unknown as {
    createWorker: (languages?: string) => Promise<{
      recognize: (
        image: HTMLCanvasElement,
      ) => Promise<{ data: { text: string | null | undefined } }>;
      terminate: () => Promise<void>;
    }>;
  };

  const worker = await tesseract.createWorker('eng+fra');
  try {
    const ocrPages: string[] = [];
    const pageCount = Math.min(pdf.numPages, OCR_MAX_PAGES);

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const context = canvas.getContext('2d');
      if (!context) continue;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      const result = await worker.recognize(canvas);
      const pageText = normalizeText(result.data.text ?? '');
      if (pageText) ocrPages.push(pageText);

      // Cleanup canvas memory
      canvas.width = 0;
      canvas.height = 0;
    }

    return normalizeText(ocrPages.join('\n'));
  } finally {
    await worker.terminate();
  }
}

async function parsePdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: arrayBuffer,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;

  const textLayerText = await extractPdfTextLayer(pdf);
  if (textLayerText.length >= PDF_MIN_TEXT_CHARS_BEFORE_OCR) {
    return textLayerText;
  }

  const ocrText = await extractPdfOcr(pdf);
  return ocrText || textLayerText;
}

async function parseDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = (await import('mammoth')) as unknown as {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const result = await mammoth.extractRawText({ arrayBuffer });
  return normalizeText(result.value || '');
}

export async function readCvFileBytes(file: File): Promise<ArrayBuffer> {
  validateCvFile(file);
  return readFileAsArrayBuffer(file);
}

function selectParser(ext: string, mime: string) {
  if (ext === '.pdf' || mime === 'application/pdf') return parsePdfText;
  return parseDocxText;
}

/**
 * Browser-only CV parser. Never sends files off-device.
 * Accepts either a File (for tests / direct uses) or pre-read bytes.
 */
export async function parseCvFile(
  fileBytes: { bytes: ArrayBuffer; name: string; type: string },
  locale: 'en' | 'fr',
): Promise<ParsedCvResult> {
  const arrayBuffer = fileBytes.bytes;
  const name = fileBytes.name;
  const type = fileBytes.type;

  const extension = getLowercaseExtension(name);
  const parser = selectParser(extension, type);
  const text = await parser(arrayBuffer);

  if (!text) {
    if (extension === '.pdf' || type === 'application/pdf') {
      throw new Error('pdf_no_text_layer');
    }
    throw new Error('no_extractable_text');
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
