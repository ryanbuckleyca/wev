import 'server-only';
import { Worker } from 'node:worker_threads';
import { CvImportError } from './errors';
import type { CvImportMetadata, CvLocale } from './types';
import {
  ALLOWED_CV_MIME_TYPES,
  CV_MIME_TYPES,
  MAX_CV_FILE_SIZE_BYTES,
} from '@/lib/constants/files';

export type ParsedCvResult = {
  text: string;
  metadata: CvImportMetadata;
};

const WORKER_TIMEOUT_MS = 30_000;

async function parseDocumentInWorker(buffer: Buffer, type: 'pdf' | 'docx'): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parser.worker.js', import.meta.url), {
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
      if (code !== 0)
        reject(new CvImportError('cv_import_failed', `Worker exited with code ${code}`));
    });
  });
}

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
  if (file.size > MAX_CV_FILE_SIZE_BYTES) throw new CvImportError('file_too_large');

  const name = file.name;
  const type = file.type;
  const ext = getExtension(name);

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
