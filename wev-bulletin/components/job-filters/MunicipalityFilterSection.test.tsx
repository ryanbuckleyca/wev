import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MunicipalityFilterSection from './MunicipalityFilterSection';

describe('MunicipalityFilterSection', () => {
  const defaultProps = {
    label: 'Municipalities',
    selectedMunicipalities: [],
    totalMunicipalities: 2,
    selectedProvinces: [],
    municipalitiesByProvince: {
      Ontario: ['Toronto', 'Ottawa'],
    },
    onToggleMunicipality: vi.fn(),
    noDataMessage: 'No data',
    selectProvinceMessage: 'Select a province',
    showingFromSelectedMessage: 'Showing from selected',
  };

  it('renders municipalities without greyed out styles even if province is not selected', () => {
    render(<MunicipalityFilterSection {...defaultProps} />);

    const municipality = screen.getByText('Toronto');
    const label = municipality.closest('label');

    // Should NOT have opacity-75 or text-muted-foreground
    expect(label).not.toHaveClass('opacity-75');
    expect(municipality).not.toHaveClass('text-muted-foreground');
    expect(municipality).toHaveClass('text-sm');
    expect(municipality).toHaveClass('text-foreground');
  });

  it('renders municipalities with hover effect always', () => {
    render(<MunicipalityFilterSection {...defaultProps} />);

    const label = screen.getByText('Toronto').closest('label');
    expect(label).toHaveClass('hover:bg-primary-tint');
  });
});
