import { describe, it, expect, vi, beforeEach } from 'vitest';

// Holds the message the mock Worker should emit via its 'message' event.
// Each test sets this before dynamically importing parser.server.
let nextWorkerResponse: Record<string, unknown> | null = null;

vi.mock('node:worker_threads', () => {
  const MockWorker = vi.fn().mockImplementation(function (this: any) {
    this._listeners = {} as Record<string, (...args: any[]) => void>;
    this.on = vi.fn((event: string, cb: (...args: any[]) => void) => {
      this._listeners[event] = cb;
    });
    this.terminate = vi.fn();
    // Fire the message callback on the next tick so .on() handlers register first
    setTimeout(() => {
      if (nextWorkerResponse !== null) {
        this._listeners['message']?.(nextWorkerResponse);
      }
    }, 0);
  });

  return {
    default: { Worker: MockWorker },
    Worker: MockWorker,
  };
});

// Mock server-only to be a no-op in tests
vi.mock('server-only', () => ({}));

describe('Server-side CV Parser', () => {
  beforeEach(() => {
    nextWorkerResponse = null;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('extracts text from PDF via worker thread', async () => {
    nextWorkerResponse = {
      success: true,
      text: 'Experienced in project management and community outreach. This is long enough to satisfy the minimum.',
    };

    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake-pdf-bytes'], 'cv.pdf', { type: 'application/pdf' });

    const parsed = await parseCvOnServer(file, 'en');

    expect(parsed.text).toContain('project management');
    expect(parsed.metadata.filename).toBe('cv.pdf');
    expect(parsed.metadata.source).toBe('cv_upload');
  });

  it('extracts text from DOCX via worker thread', async () => {
    nextWorkerResponse = { success: true, text: 'Extracted DOCX text' };

    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake-docx-bytes'], 'cv.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const parsed = await parseCvOnServer(file, 'en');
    expect(parsed.text).toBe('Extracted DOCX text');
    expect(parsed.metadata.filename).toBe('cv.docx');
  });

  it('accepts short but valid PDF text from the worker', async () => {
    nextWorkerResponse = { success: true, text: 'Short CV summary' };

    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake-pdf-bytes'], 'short.pdf', { type: 'application/pdf' });

    const parsed = await parseCvOnServer(file, 'en');
    expect(parsed.text).toBe('Short CV summary');
    expect(parsed.metadata.filename).toBe('short.pdf');
  });

  it('throws error for unsupported file types', async () => {
    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake'], 'cv.txt', { type: 'text/plain' });
    await expect(parseCvOnServer(file, 'en')).rejects.toThrowError('unsupported_file_type');
  });

  it('throws error when worker reports pdf_no_text_layer', async () => {
    nextWorkerResponse = { success: false, error: 'pdf_no_text_layer' };

    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake-pdf-bytes'], 'scanned.pdf', { type: 'application/pdf' });
    await expect(parseCvOnServer(file, 'en')).rejects.toThrowError('pdf_no_text_layer');
  });

  it('throws error for empty files', async () => {
    const { parseCvOnServer } = await import('./parser.server');
    const file = new File([], 'cv.pdf', { type: 'application/pdf' });
    await expect(parseCvOnServer(file, 'en')).rejects.toThrowError('empty_file');
  });
});
