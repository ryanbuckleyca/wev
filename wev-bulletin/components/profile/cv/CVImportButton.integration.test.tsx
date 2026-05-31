import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CVImportButton from './CVImportButton';
import { NextIntlClientProvider } from 'next-intl';
import notify from '@/lib/toast';

vi.mock('@/lib/toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock translations
const messages = {
  profile: {
    cvImportInputLabel: 'Upload CV file',
    cvImportButton: 'Import from CV',
    cvReimportButton: 'Update from CV',
    cvImportDropHint: 'or drag and drop PDF/DOCX',
    cvReimportWarning: 'This will overwrite your current skills and values.',
    cvImportedIndicator: 'Last imported: {fileName} on {importedAt}',
    cvParsingWaitWarning: 'Parsing your CV, please wait...',
    cv_import_failed: 'CV import failed. Please try another file.',
    rate_limit_exceeded: "You've reached the CV import limit. Please wait a bit before trying again.",
    unsupported_file_type: 'Only PDF and DOCX files are supported.',
    empty_file: 'The selected file is empty.',
  },
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('CVImportButton', () => {
  let globalFetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    globalFetchMock = vi.fn();
    global.fetch = globalFetchMock as any;
    vi.clearAllMocks();
  });

  it('renders the import button and hidden file input', () => {
    renderWithIntl(
      <CVImportButton locale="en" cvImport={null} isSaving={false} onConfirmImport={() => {}} />,
    );

    expect(screen.getByRole('button', { name: 'Import from CV' })).toBeVisible();
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('calls the API and fires onConfirmImport when a file is selected', async () => {
    const user = userEvent.setup();
    const handleConfirmImport = vi.fn().mockResolvedValue(undefined);

    globalFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        skills: [{ concept_uri: 'test-uri', term: 'Test Skill', score: 0.9 }],
        values: ['Innovation'],
        metadata: {
          filename: 'test.pdf',
          imported_at: '2023-10-01T12:00:00Z',
          source: 'cv_upload',
          locale: 'en',
        },
      }),
    });

    renderWithIntl(
      <CVImportButton
        locale="en"
        cvImport={null}
        isSaving={false}
        onConfirmImport={handleConfirmImport}
      />,
    );

    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });

    // We get the input via querySelector since it is hidden and might not have a label that userEvent easily finds
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // Simulate user selecting a file
    await user.upload(input, file);

    await waitFor(() => {
      expect(handleConfirmImport).toHaveBeenCalledWith({
        skills: [{ concept_uri: 'test-uri', term: 'Test Skill', score: 0.9 }],
        values: ['Innovation'],
        warnings: [],
        cvImport: {
          filename: 'test.pdf',
          imported_at: '2023-10-01T12:00:00Z',
          source: 'cv_upload',
          locale: 'en',
        },
      });
    });
  });

  it('shows re-import text and warning if cvImport metadata is present', () => {
    renderWithIntl(
      <CVImportButton
        locale="en"
        cvImport={{
          filename: 'old.pdf',
          imported_at: '2023-10-01T12:00:00Z',
          source: 'cv_upload',
          locale: 'en',
        }}
        isSaving={false}
        onConfirmImport={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Update from CV' })).toBeVisible();
    // Warning is always visible when a previous import exists (not just on drag)
    expect(screen.getByText(/This will overwrite your current skills and values/)).toBeVisible();
  });

  it('falls back to a generic message for unknown server error strings', async () => {
    const user = userEvent.setup();

    globalFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'upstream_service_meltdown',
      }),
    });

    renderWithIntl(
      <CVImportButton locale="en" cvImport={null} isSaving={false} onConfirmImport={() => {}} />,
    );

    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith('CV import failed. Please try another file.');
    });
  });

  it('shows the translated rate limit message when the API returns a stable code', async () => {
    const user = userEvent.setup();

    globalFetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: 'rate_limit_exceeded',
      }),
    });

    renderWithIntl(
      <CVImportButton locale="en" cvImport={null} isSaving={false} onConfirmImport={() => {}} />,
    );

    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith(
        "You've reached the CV import limit. Please wait a bit before trying again.",
      );
    });
  });

  it('shows an error and skips the request when an unsupported file is dropped', async () => {
    renderWithIntl(
      <CVImportButton locale="en" cvImport={null} isSaving={false} onConfirmImport={() => {}} />,
    );

    const dropZone = screen.getByText('or drag and drop PDF/DOCX').closest('div');
    expect(dropZone).toBeTruthy();

    const file = new File(['bad'], 'notes.txt', { type: 'text/plain' });
    fireEvent.drop(dropZone as HTMLDivElement, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith('Only PDF and DOCX files are supported.');
    });
    expect(globalFetchMock).not.toHaveBeenCalled();
  });

  it('shows an error and skips the request when an empty file is selected', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <CVImportButton locale="en" cvImport={null} isSaving={false} onConfirmImport={() => {}} />,
    );

    const file = new File([], 'empty.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    await waitFor(() => {
      expect(notify.error).toHaveBeenCalledWith('The selected file is empty.');
    });
    expect(globalFetchMock).not.toHaveBeenCalled();
  });
});
