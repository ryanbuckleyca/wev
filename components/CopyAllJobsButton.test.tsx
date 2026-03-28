import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@/test-utils';
import CopyAllJobsButton from './CopyAllJobsButton';
import type { JobPosting } from '@/lib/supabase';

const originalClipboard = navigator.clipboard;
const originalClipboardItem = globalThis.ClipboardItem;
const originalBlob = globalThis.Blob;

describe('CopyAllJobsButton', () => {
  const writeMock = vi.fn().mockResolvedValue(undefined);
  let capturedPlainText = '';

  beforeEach(() => {
    capturedPlainText = '';
    const globalAny = globalThis as unknown as {
      ClipboardItem?: new (items: Record<string, Blob>) => { items: Record<string, Blob> };
      Blob?: new (parts: string[], opts?: { type?: string }) => { content: string; type: string };
    };
    globalAny.ClipboardItem = class {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    };
    globalAny.Blob = class {
      content: string;
      type: string;
      constructor(parts: string[], opts?: { type?: string }) {
        this.content = parts.join('');
        this.type = opts?.type ?? '';
      }
    };

    writeMock.mockReset();
    writeMock.mockImplementation(async (items: any[]) => {
      const item = items[0];
      if (item?.items?.['text/plain']) {
        capturedPlainText = item.items['text/plain'].content;
      }
    });

    Object.defineProperty(navigator, 'clipboard', {
      value: { write: writeMock, writeText: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    } else {
      delete (navigator as any).clipboard;
    }

    if (originalClipboardItem) {
      (globalThis as any).ClipboardItem = originalClipboardItem;
    } else {
      delete (globalThis as any).ClipboardItem;
    }

    if (originalBlob) {
      (globalThis as any).Blob = originalBlob;
    } else {
      delete (globalThis as any).Blob;
    }

    vi.clearAllMocks();
  });

  const makeJob = (overrides: Partial<JobPosting>): JobPosting =>
    ({
      id: '1',
      job_title: 'Title',
      organization: 'Org',
      location: 'Location',
      municipality: 'Municipality',
      province: 'Province',
      work_type: 'remote',
      date_posted: new Date().toISOString(),
      close_date: null,
      wage: null,
      listing_url: 'https://example.com/job',
      employment_type: 'Full-time',
      summary: null,
      is_sse: false,
      source: 'source',
      ...overrides,
    }) satisfies JobPosting;

  it('copies only the provided jobs in the given order', async () => {
    const jobA = makeJob({
      id: 'a',
      organization: 'Alpha Org',
      job_title: 'First Role',
      date_posted: '2024-01-01T00:00:00Z',
    });
    const jobB = makeJob({
      id: 'b',
      organization: 'Beta Org',
      job_title: 'Second Role',
      date_posted: '2024-01-02T00:00:00Z',
    });

    const filteredAndSortedJobs = [jobB, jobA];

    render(<CopyAllJobsButton jobs={filteredAndSortedJobs} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy All Jobs' }));
    });

    expect(writeMock).toHaveBeenCalledTimes(1);

    const idxBeta = capturedPlainText.indexOf('Who: Beta Org');
    const idxAlpha = capturedPlainText.indexOf('Who: Alpha Org');

    expect(idxBeta).toBeGreaterThanOrEqual(0);
    expect(idxAlpha).toBeGreaterThanOrEqual(0);
    expect(idxBeta).toBeLessThan(idxAlpha);
  });

  it('does not include jobs that were not passed in', async () => {
    const job = makeJob({
      id: 'only',
      organization: 'Only Org',
      job_title: 'Only Role',
    });

    render(<CopyAllJobsButton jobs={[job]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy All Jobs' }));
    });

    expect(capturedPlainText).toContain('Who: Only Org');
    expect(capturedPlainText).not.toContain('Alpha Org');
  });

  it('shows "Copied!" after a successful copy', async () => {
    const job = makeJob({ id: 'x' });
    render(<CopyAllJobsButton jobs={[job]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy All Jobs' }));
    });

    expect(screen.getByRole('button', { name: 'Copied!' })).toBeVisible();
  });

  it('renders a disabled button when there are no jobs', () => {
    render(<CopyAllJobsButton jobs={[]} />);
    const btn = screen.getByRole('button', { name: 'Copy All Jobs' });
    expect(btn).toBeDisabled();
  });
});
