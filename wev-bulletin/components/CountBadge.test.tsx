import { render, screen } from '@/test-utils';
import CountBadge from './CountBadge';
import { describe, expect, it } from 'vitest';

describe('CountBadge', () => {
  it('renders normal state when count <= max', () => {
    render(<CountBadge count={5} max={10} />);
    const badge = screen.getByText('5/10');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-muted');
  });

  it('renders alert state when count > max', () => {
    render(<CountBadge count={12} max={10} />);
    const badge = screen.getByText('12/10');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-orange-100');
  });
});
