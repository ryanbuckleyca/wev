import 'server-only';
import { Worker } from 'worker_threads';
import { CvImportError } from './errors';
import type { CvImportMetadata, CvLocale } from './types';
import { ALLOWED_CV_MIME_TYPES, CV_MIME_TYPES } from '@/lib/constants/files';

export type ParsedCvResult = {
  text: string;
  metadata: CvImportMetadata;
};

const WORKER_SCRIPT = `
  const { parentPort, workerData } = require('worker_threads');

  function normalizeText(input) {
    return input.replace(/\\u0000/g, ' ').replace(/\\s+/g, ' ').trim();
  }

  async function parsePdf(buffer) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    
    const pages = [];
    let totalChars = 0;
    let consecutiveEmpty = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str ?? '').join(' ');
      pages.push(pageText);
      const trimmedLen = pageText.trim().length;
      totalChars += trimmedLen;

      if (trimmedLen === 0) {
        consecutiveEmpty += 1;
        if (consecutiveEmpty >= 3 && totalChars === 0) break;
      } else {
        consecutiveEmpty = 0;
      }
    }
    const text = normalizeText(pages.join('\\n'));
    if (text.length < 80) throw new Error('pdf_no_text_layer');
    return text;
  }

  async function parseDocx(buffer) {
    const mammoth = await import('mammoth');
    const result = await mammoth.default.extractRawText({ buffer: Buffer.from(buffer) });
    return normalizeText(result.value || '');
  }

  async function run() {
    try {
      let text;
      if (workerData.type === 'pdf') {
        text = await parsePdf(workerData.buffer);
      } else {
        text = await parseDocx(workerData.buffer);
      }
      parentPort.postMessage({ success: true, text });
    } catch (e) {
      parentPort.postMessage({ success: false, error: e.message });
    }
  }
  run();
`;

const WORKER_TIMEOUT_MS = 30_000;

async function parseDocumentInWorker(buffer: Buffer, type: 'pdf' | 'docx'): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: { buffer, type },
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new CvImportError('cv_import_failed', 'Worker timed out'));
    }, WORKER_TIMEOUT_MS);

    worker.on('message', (msg) => {
      clearTimeout(timeout);
      if (msg.success) resolve(msg.text);
      else {
        if (msg.error === 'pdf_no_text_layer') reject(new CvImportError('pdf_no_text_layer'));
        else reject(new CvImportError('cv_import_failed', msg.error));
      }
    });

    worker.on('error', (err) => {
      clearTimeout(timeout);
      reject(new CvImportError('cv_import_failed', err.message));
    });
    worker.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new CvImportError('cv_import_failed', `Worker exited with code ${code}`));
    });
  });
}

const MAX_FILE_SIZE = 4 * 1024 * 1024;

function getExtension(name: string): string {
  const dotIdx = name.lastIndexOf('.');
  return dotIdx >= 0 ? name.slice(dotIdx + 1).toLowerCase() : '';
}

function isPdf(ext: string, mime: string): boolean {
  return ext === 'pdf' || mime === CV_MIME_TYPES.PDF;
}

function isDocx(ext: string, mime: string): boolean {
  return ext === 'docx' || mime === CV_MIME_TYPES.DOCX;
}

export async function parseCvOnServer(file: File, locale: CvLocale): Promise<ParsedCvResult> {
  // Validate before reading into memory
  if (file.size <= 0) throw new CvImportError('empty_file');
  if (file.size > MAX_FILE_SIZE) throw new CvImportError('file_too_large');

  const name = file.name;
  const type = file.type;
  const ext = getExtension(name);

  if (!isPdf(ext, type) && !isDocx(ext, type) && !ALLOWED_CV_MIME_TYPES.has(type)) {
    throw new CvImportError('unsupported_file_type');
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let text = '';
  if (isPdf(ext, type)) {
    text = await parseDocumentInWorker(buffer, 'pdf');
  } else if (isDocx(ext, type)) {
    text = await parseDocumentInWorker(buffer, 'docx');
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
