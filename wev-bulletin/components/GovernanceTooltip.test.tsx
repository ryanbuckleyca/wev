import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test-utils';
import GovernanceTooltip from './GovernanceTooltip';

describe('GovernanceTooltip', () => {
  it('renders governance label when subtype is valid', () => {
    render(<GovernanceTooltip subtype="GOV_1_1_WORKER_COOP" label="Worker Cooperative" />);

    expect(screen.getByText('Worker Cooperative')).toBeInTheDocument();
  });

  it('renders explicit label when subtype is null', () => {
    render(<GovernanceTooltip subtype={null} label="General Governance" />);

    expect(screen.getByText('General Governance')).toBeInTheDocument();
  });

  it('renders children when provided', () => {
    render(
      <GovernanceTooltip subtype="GOV_3_1_COMMUNITY_LAND_TRUST">
        <span>Custom CLT Trigger</span>
      </GovernanceTooltip>,
    );

    expect(screen.getByText('Custom CLT Trigger')).toBeInTheDocument();
  });

  it('renders plain text when subtype is EXCLUDED_NON_SSE', () => {
    render(<GovernanceTooltip subtype="EXCLUDED_NON_SSE" label="Non-SSE Entity" />);

    expect(screen.getByText('Non-SSE Entity')).toBeInTheDocument();
  });
});
