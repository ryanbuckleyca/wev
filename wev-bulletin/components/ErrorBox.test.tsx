import { render, screen } from '@/test-utils';
import ErrorBox from './ErrorBox';
import { describe, expect, it } from 'vitest';

describe('ErrorBox', () => {
  it('renders children correctly', () => {
    render(<ErrorBox>Test Error</ErrorBox>);
    expect(screen.getByText('Test Error')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<ErrorBox className="custom-class">Test Error</ErrorBox>);
    const box = screen.getByText('Test Error');
    expect(box.className).toContain('custom-class');
  });
});
