import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@/test-utils';
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

  describe('auto-dismiss timer', () => {
    it('calls onExpire after duration', () => {
      const onExpire = vi.fn();
      render(<BannerMessage type="info" message="Timed" duration={3000} onExpire={onExpire} />);
      expect(onExpire).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(3000); });
      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('does not call onExpire before duration', () => {
      const onExpire = vi.fn();
      render(<BannerMessage type="info" message="Timed" duration={3000} onExpire={onExpire} />);
      act(() => { vi.advanceTimersByTime(2999); });
      expect(onExpire).not.toHaveBeenCalled();
    });

    it('pauses the timer on hover and resumes with remaining time on mouse leave', () => {
      const onExpire = vi.fn();
      render(<BannerMessage type="warning" message="Hover" duration={3000} onExpire={onExpire} />);
      const alert = screen.getByRole('alert');

      // Advance 1s, then pause
      act(() => { vi.advanceTimersByTime(1000); });
      fireEvent.mouseEnter(alert);

      // Advance 5s while paused — must NOT fire
      act(() => { vi.advanceTimersByTime(5000); });
      expect(onExpire).not.toHaveBeenCalled();

      // Resume — 2s should remain
      fireEvent.mouseLeave(alert);
      act(() => { vi.advanceTimersByTime(1999); });
      expect(onExpire).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1); });
      expect(onExpire).toHaveBeenCalledTimes(1);
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

    it('pauses animation on mouse enter', () => {
      const { container } = render(
        <BannerMessage type="warning" message="Hover me" duration={5000} onExpire={vi.fn()} />,
      );
      fireEvent.mouseEnter(screen.getByRole('alert'));
      const bar = container.querySelector('.toast-progress-bar') as HTMLElement;
      expect(bar.style.animationPlayState).toBe('paused');
    });

    it('resumes animation on mouse leave', () => {
      const { container } = render(
        <BannerMessage type="warning" message="Hover me" duration={5000} onExpire={vi.fn()} />,
      );
      fireEvent.mouseEnter(screen.getByRole('alert'));
      fireEvent.mouseLeave(screen.getByRole('alert'));
      // bar is re-mounted on resume — re-query it
      const bar = container.querySelector('.toast-progress-bar') as HTMLElement;
      expect(bar.style.animationPlayState).toBe('running');
    });
  });
});
