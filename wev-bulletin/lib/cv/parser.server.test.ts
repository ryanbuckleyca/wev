import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the worker_threads module: the Worker constructor will call the
// onMessage callback with the workerData we provide, simulating the real
// worker without actually spawning a thread (which can't see vitest mocks).
const mockPostMessage = vi.fn();

vi.mock('worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('worker_threads')>();
  return {
    ...actual,
    Worker: vi.fn().mockImplementation(function (this: any) {
      this._listeners = {} as Record<string, Function>;
      this.on = vi.fn((event: string, cb: Function) => {
        this._listeners[event] = cb;
      });
      this.terminate = vi.fn();
      // Schedule the message callback async so .on() handlers are registered first
      setTimeout(() => {
        if (mockPostMessage.mock.calls.length > 0) {
          const msg = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0];
          this._listeners['message']?.(msg);
        }
      }, 0);
    }),
  };
});

// Mock server-only to be a no-op in tests
vi.mock('server-only', () => ({}));

describe('Server-side CV Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('extracts text from PDF via worker thread', async () => {
    mockPostMessage.mockImplementation(() => [
      {
        success: true,
        text: 'Experienced in project management and community outreach. This is long enough to satisfy the minimum.',
      },
    ]);

    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake-pdf-bytes'], 'cv.pdf', { type: 'application/pdf' });

    // The worker mock will post the success message
    const parsed = await parseCvOnServer(file, 'en');

    expect(parsed.text).toContain('project management');
    expect(parsed.metadata.filename).toBe('cv.pdf');
    expect(parsed.metadata.source).toBe('cv_upload');
  });

  it('extracts text from DOCX via worker thread', async () => {
    mockPostMessage.mockImplementation(() => [
      { success: true, text: 'Extracted DOCX text' },
    ]);

    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake-docx-bytes'], 'cv.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const parsed = await parseCvOnServer(file, 'en');
    expect(parsed.text).toBe('Extracted DOCX text');
    expect(parsed.metadata.filename).toBe('cv.docx');
  });

  it('throws error for unsupported file types', async () => {
    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake'], 'cv.txt', { type: 'text/plain' });
    await expect(parseCvOnServer(file, 'en')).rejects.toThrowError('unsupported_file_type');
  });

  it('throws error when worker reports pdf_no_text_layer', async () => {
    mockPostMessage.mockImplementation(() => [
      { success: false, error: 'pdf_no_text_layer' },
    ]);

    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake-pdf-bytes'], 'scanned.pdf', { type: 'application/pdf' });
    await expect(parseCvOnServer(file, 'en')).rejects.toThrowError('pdf_no_text_layer');
  });

  it('throws error for empty files', async () => {
    const { parseCvOnServer } = await import('./parser.server');
    const file = new File([], 'cv.pdf', { type: 'application/pdf' });
    // File constructor with empty array creates 0-byte file
    await expect(parseCvOnServer(file, 'en')).rejects.toThrowError('empty_file');
  });
});
