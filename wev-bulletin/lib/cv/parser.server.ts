import 'server-only';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { CvImportError } from './errors';
import type { CvImportMetadata, CvLocale } from './types';
import { CV_MIME_TYPES, MAX_CV_FILE_SIZE_BYTES } from '@/lib/constants/files';

export type ParsedCvResult = {
  text: string;
  metadata: CvImportMetadata;
};

const WORKER_TIMEOUT_MS = 30_000;

async function parseDocumentInWorker(buffer: Buffer, type: 'pdf' | 'docx'): Promise<string> {
  // Use path.resolve(__dirname) instead of new URL(import.meta.url) — Turbopack
  // cannot statically analyse the URL constructor pattern for Node worker_threads.
  const workerPath = path.resolve(__dirname, 'parser.worker.js');
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { buffer, type },
    });

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    const timeout = setTimeout(() => {
      settle(() => {
        worker.terminate();
        reject(new CvImportError('cv_import_failed', 'Worker timed out'));
      });
    }, WORKER_TIMEOUT_MS);

    worker.on('message', (msg) => {
      settle(() => {
        void worker.terminate();
        if (msg.success) resolve(msg.text);
        else {
          if (msg.error === 'pdf_no_text_layer') reject(new CvImportError('pdf_no_text_layer'));
          else if (msg.error === 'no_extractable_text')
            reject(new CvImportError('no_extractable_text'));
          else reject(new CvImportError('cv_import_failed', msg.error));
        }
      });
    });

    worker.on('error', (err) => {
      settle(() => reject(new CvImportError('cv_import_failed', err.message)));
    });

    worker.on('exit', (code) => {
      if (code !== 0)
        settle(() =>
          reject(new CvImportError('cv_import_failed', `Worker exited with code ${code}`)),
        );
    });
  });
}

function getExtension(name: string): string {
  const dotIdx = name.lastIndexOf('.');
  return dotIdx >= 0 ? name.slice(dotIdx + 1).toLowerCase() : '';
}

function getDocumentType(ext: string, mime: string): 'pdf' | 'docx' | null {
  if (ext === 'pdf' || mime === CV_MIME_TYPES.PDF) return 'pdf';
  if (ext === 'docx' || mime === CV_MIME_TYPES.DOCX) return 'docx';
  return null;
}

export async function parseCvOnServer(file: File, locale: CvLocale): Promise<ParsedCvResult> {
  if (file.size <= 0) throw new CvImportError('empty_file');
  if (file.size > MAX_CV_FILE_SIZE_BYTES) throw new CvImportError('file_too_large');

  const ext = getExtension(file.name);
  const docType = getDocumentType(ext, file.type);
  if (!docType) throw new CvImportError('unsupported_file_type');

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    throw new CvImportError('file_read_failed');
  }

  const text = await parseDocumentInWorker(buffer, docType);

  if (!text) {
    throw new CvImportError('no_extractable_text');
  }

  return {
    text,
    metadata: {
      filename: file.name,
      imported_at: new Date().toISOString(),
      // 'cv_upload' is the only source today. Extend this union when other
      // import paths are added (e.g. 'linkedin_import').
      source: 'cv_upload',
      locale,
    },
  };
}
