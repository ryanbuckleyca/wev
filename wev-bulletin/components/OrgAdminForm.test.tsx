import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrgAdminForm from './OrgAdminForm';

const { pushMock, refreshMock, createOrganizationMock, updateOrganizationMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  createOrganizationMock: vi.fn(),
  updateOrganizationMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'slugPreview') return `Slug preview: ${String(values?.slug ?? '')}`;
    return key;
  },
}));

vi.mock('@/lib/organizations/actions', () => ({
  createOrganization: createOrganizationMock,
  updateOrganization: updateOrganizationMock,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('OrgAdminForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOrganizationMock.mockResolvedValue({
      ok: true,
      org: { id: 1, name: 'Test Org' },
    });
  });

  it('renders core admin fields', () => {
    render(<OrgAdminForm locale="en" />);

    expect(screen.getByLabelText(/fields\.name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/fields\.slug/)).toBeInTheDocument();
    expect(screen.getByLabelText(/fields\.website/)).toBeInTheDocument();
    expect(screen.getByLabelText(/fields\.location/)).toBeInTheDocument();
    expect(screen.getByLabelText(/fields\.type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/fields\.isSse/)).toBeInTheDocument();
  });

  it('updates slug preview while typing name in create mode', () => {
    render(<OrgAdminForm locale="en" />);

    fireEvent.change(screen.getByLabelText(/fields\.name/), {
      target: { value: 'Centraide Montreal' },
    });

    expect(screen.getByText('Slug preview: centraide-montreal')).toBeInTheDocument();
  });

  it('shows name validation error and does not call create action', async () => {
    render(<OrgAdminForm locale="en" />);

    const submitButton = screen.getByRole('button', { name: 'actions.create' });
    const form = submitButton.closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('errors.nameRequired')).toBeInTheDocument();
      expect(createOrganizationMock).not.toHaveBeenCalled();
    });
  });
});
