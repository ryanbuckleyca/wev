import { render, screen } from '@/test-utils';
import Message from './Message';
import { describe, expect, it } from 'vitest';

describe('Message', () => {
  it('renders children', () => {
    render(<Message>Test message</Message>);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('applies success variant classes', () => {
    render(<Message variant="success">Success</Message>);
    const p = screen.getByText('Success');
    expect(p).toHaveClass('text-[var(--success-text)]');
  });

  it('applies error variant classes', () => {
    render(<Message variant="error">Error</Message>);
    const p = screen.getByText('Error');
    expect(p).toHaveClass('text-[var(--destructive-foreground)]');
  });
});
