import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCvFile } from '@/lib/cv-parser';
import { extractSkillsFromCvText } from '@/lib/cv-skills-extractor';
import { inferValuesFromCvText } from '@/lib/cv-values-extractor';

const getDocumentMock = vi.fn();
const createWorkerMock = vi.fn();

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: getDocumentMock,
}));

vi.mock('tesseract.js', () => ({
  createWorker: createWorkerMock,
}));

const ESCO_LABELS_FIXTURE = [
  {
    uri: 'http://data.europa.eu/esco/skill/project-management',
    en: 'project management',
    fr: 'gestion de projet',
    alt_en: ['program management'],
  },
  {
    uri: 'http://data.europa.eu/esco/skill/community-outreach',
    en: 'community outreach',
    fr: 'mobilisation communautaire',
    alt_en: ['community engagement'],
  },
] as const;

function mockEscoLabelsFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (typeof input === 'string' && input === '/esco-labels.json') {
      return new Response(JSON.stringify(ESCO_LABELS_FIXTURE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch in test: ${String(input)}`);
  });
}

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

async function runSkillAndValueExtraction(parsedText: string) {
  const skills = await extractSkillsFromCvText(parsedText, 'en', {
    maxSkills: 10,
    similarityThreshold: 0.72,
  });
  const values = inferValuesFromCvText(parsedText, 'en', 5);
  return { skills, values };
}

describe('CV import integration — OCR fallback + extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEscoLabelsFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses PDF text layer when available (OCR not used) and still extracts skills/values', async () => {
    const pdfWithTextLayer = makePdfDocument(
      'Experienced in project management and community outreach. Seeking challenge-driven roles.',
    );

    getDocumentMock.mockReturnValue({ promise: Promise.resolve(pdfWithTextLayer) });

    const file = new File(['fake'], 'ocrd-cv.pdf', { type: 'application/pdf' });
    const parsed = await parseCvFile(file, 'en');

    expect(createWorkerMock).not.toHaveBeenCalled();
    expect(parsed.text.toLowerCase()).toContain('project management');

    const { skills, values } = await runSkillAndValueExtraction(parsed.text);

    expect(skills.map((s) => s.uri)).toContain(
      'http://data.europa.eu/esco/skill/project-management',
    );
    expect(skills.map((s) => s.uri)).toContain(
      'http://data.europa.eu/esco/skill/community-outreach',
    );
    expect(values).toContain('Challenge');
    expect(values).toContain('Community');
  });

  it('falls back to browser OCR for scanned PDFs and extracts skills/values from OCR text', async () => {
    const scannedPdf = makePdfDocument('');
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(scannedPdf) });

    const recognizeMock = vi.fn(async () => ({
      data: {
        text: 'Community outreach coordinator with project management experience. Looking for challenge and growth.',
      },
    }));

    const terminateMock = vi.fn(async () => undefined);

    createWorkerMock.mockResolvedValue({
      recognize: recognizeMock,
      terminate: terminateMock,
    });

    const file = new File(['fake'], 'scanned-cv.pdf', { type: 'application/pdf' });
    const parsed = await parseCvFile(file, 'en');

    expect(createWorkerMock).toHaveBeenCalledOnce();
    expect(recognizeMock).toHaveBeenCalledOnce();
    expect(terminateMock).toHaveBeenCalledOnce();
    expect(parsed.text.toLowerCase()).toContain('community outreach');

    const { skills, values } = await runSkillAndValueExtraction(parsed.text);

    expect(skills.map((s) => s.uri)).toContain(
      'http://data.europa.eu/esco/skill/project-management',
    );
    expect(skills.map((s) => s.uri)).toContain(
      'http://data.europa.eu/esco/skill/community-outreach',
    );
    expect(values).toContain('Challenge');
    expect(values).toContain('Community');
  });

  it('returns a specific scanned-PDF error when no text is extractable even after OCR', async () => {
    const scannedPdf = makePdfDocument('');
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(scannedPdf) });

    const recognizeMock = vi.fn(async () => ({ data: { text: '' } }));
    const terminateMock = vi.fn(async () => undefined);

    createWorkerMock.mockResolvedValue({
      recognize: recognizeMock,
      terminate: terminateMock,
    });

    const file = new File(['fake'], 'empty-scanned-cv.pdf', { type: 'application/pdf' });

    await expect(parseCvFile(file, 'en')).rejects.toThrowError('pdf_no_text_layer');
    expect(createWorkerMock).toHaveBeenCalledOnce();
    expect(recognizeMock).toHaveBeenCalledOnce();
    expect(terminateMock).toHaveBeenCalledOnce();
  });
});
