import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCvFile } from '@/lib/cv-parser';

const mockGetDocument = vi.fn();
const mockCreateWorker = vi.fn();

vi.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker,
}));

function makePdfDocument(textLayerText: string) {
  return {
    numPages: 1,
    getPage: vi.fn(async () => ({
      getTextContent: vi.fn(async () => ({
        items: textLayerText ? [{ str: textLayerText }] : [],
      })),
      getViewport: vi.fn(() => ({ width: 600, height: 900 })),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
    })),
  };
}

describe('CV import integration — PDF/OCR Parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock HTMLCanvasElement.getContext for OCR tests in JSDOM
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
    } as any);

    // Inject global mock for PDF.js to bypass Vitest's module mocker bugs
    (globalThis as any).MOCK_PDFJS = {
      getDocument: mockGetDocument,
      GlobalWorkerOptions: { workerSrc: '' },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).MOCK_PDFJS;
  });

  it('extracts text from PDF text layer when available', async () => {
    const pdfWithTextLayer = makePdfDocument(
      'Experienced in project management and community outreach. ' +
        'This is a long enough text to skip the OCR fallback mechanism and use the direct text layer extraction path instead. ' +
        'We need more than 80 characters to satisfy the PDF_MIN_TEXT_CHARS_BEFORE_OCR threshold.',
    );

    mockGetDocument.mockReturnValue({ promise: Promise.resolve(pdfWithTextLayer) });

    const file = new File(['fake'], 'cv-with-text.pdf', { type: 'application/pdf' });
    const parsed = await parseCvFile(
      { bytes: await file.arrayBuffer(), name: file.name, type: file.type },
      'en',
    );

    expect(mockCreateWorker).not.toHaveBeenCalled();
    expect(parsed.text).toContain('project management');
    expect(parsed.text).toContain('community outreach');
    expect(parsed.metadata.filename).toBe('cv-with-text.pdf');
  });

  it('falls back to OCR for scanned PDFs without a text layer', async () => {
    const scannedPdf = makePdfDocument(''); // Empty text layer
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(scannedPdf) });

    const recognizeMock = vi.fn(async () => ({
      data: {
        text: 'Scanned text content: project management expert.',
      },
    }));

    const terminateMock = vi.fn(async () => undefined);

    mockCreateWorker.mockResolvedValue({
      recognize: recognizeMock,
      terminate: terminateMock,
    });

    const file = new File(['fake'], 'scanned-cv.pdf', { type: 'application/pdf' });
    const parsed = await parseCvFile(
      { bytes: await file.arrayBuffer(), name: file.name, type: file.type },
      'en',
    );

    expect(mockCreateWorker).toHaveBeenCalledOnce();
    expect(recognizeMock).toHaveBeenCalledOnce();
    expect(terminateMock).toHaveBeenCalledOnce();
    expect(parsed.text).toContain('project management');
  });

  it('throws a specific error when no text can be extracted even after OCR', async () => {
    const emptyPdf = makePdfDocument('');
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(emptyPdf) });

    const recognizeMock = vi.fn(async () => ({ data: { text: '' } }));
    const terminateMock = vi.fn(async () => undefined);

    mockCreateWorker.mockResolvedValue({
      recognize: recognizeMock,
      terminate: terminateMock,
    });

    const file = new File(['fake'], 'empty.pdf', { type: 'application/pdf' });

    await expect(
      parseCvFile({ bytes: await file.arrayBuffer(), name: file.name, type: file.type }, 'en'),
    ).rejects.toThrowError('pdf_no_text_layer');
  });
});
