import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test-utils';
import Collapsible from './Collapsible';

describe('Collapsible', () => {
  it('does not render children while closed on first mount', () => {
    render(
      <Collapsible isOpen={false}>
        <p>Filter options</p>
      </Collapsible>,
    );

    expect(screen.queryByText('Filter options')).not.toBeInTheDocument();
  });

  it('renders children when open on first mount', () => {
    render(
      <Collapsible isOpen={true}>
        <p>Filter options</p>
      </Collapsible>,
    );

    expect(screen.getByText('Filter options')).toBeVisible();
  });
});
