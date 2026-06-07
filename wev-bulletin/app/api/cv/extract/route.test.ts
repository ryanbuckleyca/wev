import { POST } from './route';
import { getRequestUser } from '@/lib/auth/request-user';
import { extractSkillsAndValuesFromCv } from '@/lib/cv';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/cv', () => ({
  extractSkillsAndValuesFromCv: vi.fn(),
}));

const { mockParseCvOnServer } = vi.hoisted(() => ({
  mockParseCvOnServer: vi.fn().mockResolvedValue({ text: 'CV text', metadata: {} }),
}));

vi.mock('@/lib/cv/parser.server', () => ({
  parseCvOnServer: mockParseCvOnServer,
}));

describe('POST /api/cv/extract', () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalJinaKey = process.env.JINA_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.JINA_API_KEY = 'test-jina-key';
  });

  afterEach(() => {
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;

    if (originalJinaKey === undefined) delete process.env.JINA_API_KEY;
    else process.env.JINA_API_KEY = originalJinaKey;
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getRequestUser).mockResolvedValue({ ok: false } as any);
    const request = new Request('http://localhost/api/cv/extract', { method: 'POST' });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 if file is missing', async () => {
    vi.mocked(getRequestUser).mockResolvedValue({ ok: true, user: { id: 'user-1' } } as any);
    const formData = new FormData();
    const request = new Request('http://localhost/api/cv/extract', {
      method: 'POST',
      body: formData,
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 200 and extracted data on success', async () => {
    vi.mocked(getRequestUser).mockResolvedValue({ ok: true, user: { id: 'user-1' } } as any);
    vi.mocked(extractSkillsAndValuesFromCv).mockResolvedValue({
      skills: [],
      values: [],
      warnings: [],
    } as any);

    const file = new File(['test cv content'], 'cv.pdf', { type: 'application/pdf' });
    const formData = {
      get: (key: string) => {
        if (key === 'file') return file;
        if (key === 'locale') return 'en';
        return null;
      },
    };

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
      url: 'http://localhost/api/cv/extract',
    } as any;

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('skills');
    expect(extractSkillsAndValuesFromCv).toHaveBeenCalled();
    expect(mockParseCvOnServer).toHaveBeenCalledWith(file, 'en');
  });

  it('returns 500 if extraction fails', async () => {
    vi.mocked(getRequestUser).mockResolvedValue({ ok: true, user: { id: 'user-1' } } as any);
    vi.mocked(extractSkillsAndValuesFromCv).mockRejectedValue(new Error('Extraction failed'));

    const file = new File(['test cv content'], 'cv.pdf', { type: 'application/pdf' });
    const formData = {
      get: (key: string) => {
        if (key === 'file') return file;
        if (key === 'locale') return 'en';
        return null;
      },
    };

    const request = {
      formData: vi.fn().mockResolvedValue(formData),
      url: 'http://localhost/api/cv/extract',
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(500);
    expect(await response.json()).toHaveProperty('error', 'extraction_failed');
  });
});
