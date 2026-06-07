import { render, screen, fireEvent } from '@/test-utils';
import ThemeToggle from './ThemeToggle';
import { describe, expect, it, afterEach } from 'vitest';

describe('ThemeToggle', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders correctly with initial light theme', () => {
    render(<ThemeToggle initialTheme="light" />);
    // When theme is light, aria-label should be "Switch to dark mode"
    expect(screen.getByLabelText(/switch to dark mode/i)).toBeInTheDocument();
  });

  it('renders correctly with initial dark theme', () => {
    render(<ThemeToggle initialTheme="dark" />);
    // When theme is dark, aria-label should be "Switch to light mode"
    expect(screen.getByLabelText(/switch to light mode/i)).toBeInTheDocument();
  });

  it('toggles theme on click', () => {
    render(<ThemeToggle initialTheme="light" />);
    const button = screen.getByLabelText(/switch to dark mode/i);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-label', expect.stringMatching(/switch to light mode/i));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
