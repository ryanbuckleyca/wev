import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDocument = vi.fn();

// Mock pdfjs-dist with dynamic import support
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: (options: any) => ({
    promise: mockGetDocument(options),
  }),
}));

// Mock mammoth
vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: 'Extracted DOCX text' })),
  },
}));

// Mock server-only to be a no-op in tests
vi.mock('server-only', () => ({}));

function makePdfDocument(textLayerText: string) {
  return {
    numPages: 1,
    getPage: vi.fn(async () => ({
      getTextContent: vi.fn(async () => ({
        items: textLayerText ? [{ str: textLayerText }] : [],
      })),
    })),
  };
}

describe('Server-side CV Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts text from PDF text layer', async () => {
    const pdfWithTextLayer = makePdfDocument(
      'Experienced in project management and community outreach. ' +
        'This is a long enough text to satisfy the PDF_MIN_TEXT_CHARS_BEFORE_OCR threshold.',
    );

    mockGetDocument.mockResolvedValue(pdfWithTextLayer);

    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake'], 'cv.pdf', { type: 'application/pdf' });
    const parsed = await parseCvOnServer(file, 'en');

    expect(parsed.text).toContain('project management');
    expect(parsed.metadata.filename).toBe('cv.pdf');
  });

  it('extracts text from DOCX', async () => {
    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake'], 'cv.docx', {
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

  it('throws error for scanned/empty PDFs (since OCR is disabled on server)', async () => {
    const emptyPdf = makePdfDocument('');
    mockGetDocument.mockResolvedValue(emptyPdf);

    const { parseCvOnServer } = await import('./parser.server');
    const file = new File(['fake'], 'scanned.pdf', { type: 'application/pdf' });
    await expect(parseCvOnServer(file, 'en')).rejects.toThrowError('pdf_no_text_layer');
  });
});
