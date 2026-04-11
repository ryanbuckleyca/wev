import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorMessage from './ErrorMessage';

describe('ErrorMessage', () => {
  it('renders children text', () => {
    render(<ErrorMessage>Something went wrong</ErrorMessage>);
    expect(screen.getByText('Something went wrong')).toBeVisible();
  });

  it('renders as a paragraph element', () => {
    render(<ErrorMessage>Error</ErrorMessage>);
    const el = screen.getByText('Error');
    expect(el.tagName).toBe('P');
  });

  it('applies custom className', () => {
    render(<ErrorMessage className="extra">Oops</ErrorMessage>);
    expect(screen.getByText('Oops').className).toContain('extra');
  });

  it('always includes the error text color class', () => {
    render(<ErrorMessage>Fail</ErrorMessage>);
    expect(screen.getByText('Fail').className).toContain('text-[var(--destructive-foreground)]');
  });
});
