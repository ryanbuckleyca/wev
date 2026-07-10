import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrgAdminForm from './OrgAdminForm';

const {
  pushMock,
  replaceMock,
  refreshMock,
  createOrganizationMock,
  updateOrganizationMock,
  deleteOrganizationMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
  createOrganizationMock: vi.fn(),
  updateOrganizationMock: vi.fn(),
  deleteOrganizationMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: refreshMock,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const fn = (key: string, values?: Record<string, unknown>) => {
      if (key === 'slugPreview') return `Slug preview: ${String(values?.slug ?? '')}`;
      if (namespace === 'profile' && key === 'valuesModalTriggerLabel') return 'Browse values';
      if (namespace === 'profile' && key === 'valuesPlaceholder') return 'Search values';
      if (key === 'errors.nameRequired') return 'Organization name is required';
      if (key === 'errors.saveFailed') return 'Failed to save organization';
      if (key === 'deleteConfirm') return `Delete ${String(values?.name ?? '')}?`;
      return key;
    };
    fn.has = () => false;
    return fn;
  },
}));

vi.mock('@/lib/organizations/actions', () => ({
  createOrganization: createOrganizationMock,
  updateOrganization: updateOrganizationMock,
  deleteOrganization: deleteOrganizationMock,
}));

vi.mock('./profile/values/ValuesSelector', () => ({
  default: () => <div data-testid="values-selector" />,
}));

vi.mock('./profile/LocationAutocomplete', () => ({
  default: ({
    inputId,
    value,
    onChange,
    placeholder,
  }: {
    inputId?: string;
    value: { display_name: string } | null;
    onChange: (value: unknown) => void;
    placeholder?: string;
  }) => (
    <input
      id={inputId}
      aria-label="fields.location"
      placeholder={placeholder}
      value={value?.display_name ?? ''}
      onChange={(e) =>
        onChange(
          e.target.value
            ? {
                name: e.target.value,
                province: 'QC',
                display_name: e.target.value,
                lat: 45.5,
                lng: -73.5,
              }
            : null,
        )
      }
    />
  ),
}));

describe('OrgAdminForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOrganizationMock.mockResolvedValue({
      ok: true,
      org: { id: 1, name: 'Test Org', slug: 'test-org' },
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
    expect(screen.getByTestId('values-selector')).toBeInTheDocument();
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
      expect(createOrganizationMock).not.toHaveBeenCalled();
    });
    expect(screen.getByText('Organization name is required')).toBeInTheDocument();
  });

  it('redirects to the public org page after create', async () => {
    const locationStub = { href: 'http://localhost/en/admin/organizations/new' };
    vi.stubGlobal('location', locationStub);

    render(<OrgAdminForm locale="en" />);

    fireEvent.change(screen.getByLabelText(/fields\.name/), {
      target: { value: 'Test Org' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'actions.create' }).closest('form')!);

    await waitFor(() => {
      expect(createOrganizationMock).toHaveBeenCalled();
      expect(locationStub.href).toBe('/en/organizations/test-org');
    });

    vi.unstubAllGlobals();
  });

  it('calls updateOrganization in edit mode and redirects to public org page', async () => {
    const locationStub = { href: 'http://localhost/en/admin/organizations/42/edit' };
    vi.stubGlobal('location', locationStub);

    updateOrganizationMock.mockResolvedValue({
      ok: true,
      org: { id: 42, name: 'Existing Org', slug: 'existing-org' },
    });

    render(
      <OrgAdminForm
        locale="en"
        initialValues={{
          id: 42,
          name: 'Existing Org',
          slug: 'existing-org',
          values_list: [],
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'actions.delete' })).toBeInTheDocument();

    fireEvent.submit(screen.getByRole('button', { name: 'actions.update' }).closest('form')!);

    await waitFor(() => {
      expect(updateOrganizationMock).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          name: 'Existing Org',
          slug: 'existing-org',
          values_list: [],
        }),
      );
      expect(locationStub.href).toBe('/en/organizations/existing-org');
    });

    vi.unstubAllGlobals();
  });

  it('deletes organization after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteOrganizationMock.mockResolvedValue({ ok: true });

    const locationStub = { href: 'http://localhost/en/admin/organizations/42/edit' };
    vi.stubGlobal('location', locationStub);

    render(
      <OrgAdminForm
        locale="en"
        initialValues={{
          id: 42,
          name: 'Existing Org',
          slug: 'existing-org',
          values_list: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));

    await waitFor(() => {
      expect(deleteOrganizationMock).toHaveBeenCalledWith(42);
      expect(locationStub.href).toBe('/en/admin/organizations');
    });

    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
