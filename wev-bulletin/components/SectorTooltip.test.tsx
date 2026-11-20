import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test-utils';
import SectorTooltip from './SectorTooltip';

describe('SectorTooltip', () => {
  it('renders sector label when sectorId is valid', () => {
    render(
      <SectorTooltip
        sectorId="advocacy-rights-representation"
        label="Advocacy, Rights & Representation"
      />,
    );

    expect(screen.getByText('Advocacy, Rights & Representation')).toBeInTheDocument();
  });

  it('renders explicit label when sectorId is null', () => {
    render(<SectorTooltip sectorId={null} label="General Sector" />);

    expect(screen.getByText('General Sector')).toBeInTheDocument();
  });

  it('renders children when provided', () => {
    render(
      <SectorTooltip sectorId="housing-collective-real-estate">
        <span>Custom Housing Trigger</span>
      </SectorTooltip>,
    );

    expect(screen.getByText('Custom Housing Trigger')).toBeInTheDocument();
  });

  it('canonicalizes legacy or alternate sector slugs', () => {
    render(<SectorTooltip sectorId="housing" label="Housing" />);

    expect(screen.getByText('Housing')).toBeInTheDocument();
  });
});
