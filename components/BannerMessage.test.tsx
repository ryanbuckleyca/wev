import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@/test-utils';
import BannerMessage from './BannerMessage';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('BannerMessage', () => {
  it('renders the message text', () => {
    render(<BannerMessage type="success" message="Profile saved" />);
    expect(screen.getByText('Profile saved')).toBeInTheDocument();
  });

  it('has role="alert" for screen readers', () => {
    render(<BannerMessage type="error" message="Something went wrong" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it.each(['success', 'error', 'warning', 'info'] as const)(
    'applies the correct type class for %s',
    (type) => {
      const typeClassMap = {
        success: 'design-toast-success',
        error: 'design-toast-alert',
        warning: 'design-toast-warning',
        info: 'design-toast-info',
      };
      const { container } = render(<BannerMessage type={type} message="Test" />);
      expect(container.firstChild).toHaveClass(typeClassMap[type]);
    },
  );

  describe('close button', () => {
    it('is not rendered without onDismiss', () => {
      render(<BannerMessage type="info" message="Hello" />);
      expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
    });

    it('renders when onDismiss is provided', () => {
      render(<BannerMessage type="info" message="Hello" onDismiss={vi.fn()} />);
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('calls onDismiss on click', () => {
      const onDismiss = vi.fn();
      render(<BannerMessage type="success" message="Done" onDismiss={onDismiss} />);
      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('progress bar', () => {
    it('is not rendered without duration', () => {
      const { container } = render(<BannerMessage type="success" message="No timer" />);
      expect(container.querySelector('.toast-progress-bar')).not.toBeInTheDocument();
    });

    it('renders when duration is provided', () => {
      const { container } = render(
        <BannerMessage type="success" message="Timed" duration={5000} />,
      );
      expect(container.querySelector('.toast-progress-bar')).toBeInTheDocument();
    });

    it('sets animationDuration from duration prop', () => {
      const { container } = render(
        <BannerMessage type="success" message="Timed" duration={3000} />,
      );
      const bar = container.querySelector('.toast-progress-bar') as HTMLElement;
      expect(bar.style.animationDuration).toBe('3000ms');
    });

    it('pauses animation on mouse enter', () => {
      const { container } = render(
        <BannerMessage type="warning" message="Hover me" duration={5000} />,
      );
      fireEvent.mouseEnter(screen.getByRole('alert'));
      const bar = container.querySelector('.toast-progress-bar') as HTMLElement;
      expect(bar.style.animationPlayState).toBe('paused');
    });

    it('resumes animation on mouse leave', () => {
      const { container } = render(
        <BannerMessage type="warning" message="Hover me" duration={5000} />,
      );
      fireEvent.mouseEnter(screen.getByRole('alert'));
      fireEvent.mouseLeave(screen.getByRole('alert'));
      const bar = container.querySelector('.toast-progress-bar') as HTMLElement;
      expect(bar.style.animationPlayState).toBe('running');
    });
  });
});
