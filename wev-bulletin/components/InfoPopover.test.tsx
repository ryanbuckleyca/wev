import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@/test-utils';
import InfoPopover from './InfoPopover';

describe('InfoPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders trigger content', () => {
    render(
      <InfoPopover content="Tooltip popup text">
        <span>Hover Trigger</span>
      </InfoPopover>,
    );

    expect(screen.getByText('Hover Trigger')).toBeInTheDocument();
  });

  it('delays opening by 350ms on mouseenter when hoverable is true', () => {
    render(
      <InfoPopover hoverable content="Tooltip popup text">
        <span>Hover Trigger</span>
      </InfoPopover>,
    );

    const trigger = screen.getByRole('button');

    fireEvent.mouseEnter(trigger);

    // Should not be visible immediately (0ms)
    expect(screen.queryByText('Tooltip popup text')).not.toBeInTheDocument();

    // Fast-forward 200ms - still below 350ms intent delay
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Tooltip popup text')).not.toBeInTheDocument();

    // Fast-forward remaining 150ms (total 350ms)
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByText('Tooltip popup text')).toBeInTheDocument();
  });

  it('cancels open if mouse leaves before 350ms (intent guard against accidental sweep)', () => {
    render(
      <InfoPopover hoverable content="Tooltip popup text">
        <span>Hover Trigger</span>
      </InfoPopover>,
    );

    const trigger = screen.getByRole('button');

    // Sweep cursor across trigger: enter and leave after 100ms
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(trigger);

    // Advance past 350ms
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Content should NEVER have opened
    expect(screen.queryByText('Tooltip popup text')).not.toBeInTheDocument();
  });

  it('leaves focus in place after Escape closes a hover-opened popover', () => {
    render(
      <>
        <input aria-label="Search" />
        <InfoPopover hoverable content="Tooltip popup text">
          <span>Hover Trigger</span>
        </InfoPopover>
      </>,
    );

    const input = screen.getByRole('textbox');
    input.focus();
    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: 'Escape' });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(input).toHaveFocus();

    const trigger = screen.getByRole('button');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('buffers closing by 150ms when leaving', () => {
    render(
      <InfoPopover hoverable content="Tooltip popup text">
        <span>Hover Trigger</span>
      </InfoPopover>,
    );

    const trigger = screen.getByRole('button');

    // Open it
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(screen.getByText('Tooltip popup text')).toBeInTheDocument();

    // Mouse leaves
    fireEvent.mouseLeave(trigger);

    // Should still be open after 50ms buffer
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByText('Tooltip popup text')).toBeInTheDocument();

    // Advance past 150ms total
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText('Tooltip popup text')).not.toBeInTheDocument();
  });
});
