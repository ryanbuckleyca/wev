import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CVImportButton from './CVImportButton';
import { NextIntlClientProvider } from 'next-intl';

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
  });

  it('renders the import button and hidden file input', () => {
    renderWithIntl(
      <CVImportButton
        locale="en"
        cvImport={null}
        isSaving={false}
        onConfirmImport={async () => {}}
      />,
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

  it('shows re-import text if cvImport metadata is present', () => {
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
        onConfirmImport={async () => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Update from CV' })).toBeVisible();
    expect(screen.queryByText(/This will overwrite your current skills and values/)).toBeNull();
  });
});
