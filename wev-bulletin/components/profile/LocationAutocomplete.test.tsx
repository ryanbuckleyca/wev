import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import LocationAutocomplete from './LocationAutocomplete';

const mockResults = [
  { name: 'Montreal', province: 'QC', display_name: 'Montreal, QC', lat: 45.5017, lng: -73.5673 },
  { name: 'Montmagny', province: 'QC', display_name: 'Montmagny, QC', lat: 46.9833, lng: -70.55 },
];

function mockFetchSuccess(results = mockResults) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => results,
    }),
  );
}

function mockFetchError() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Internal server error' }),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
});

describe('LocationAutocomplete', () => {
  it('selection stores coords — onChange called with lat, lng, display_name, name, province', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetchSuccess();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handleChange = vi.fn();

    render(<LocationAutocomplete value={null} onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Mon');

    // Advance debounce
    vi.advanceTimersByTime(300);

    // Wait for results to appear
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Montreal, QC' })).toBeVisible();
    });

    await user.click(screen.getByRole('option', { name: 'Montreal, QC' }));

    expect(handleChange).toHaveBeenCalledWith({
      lat: 45.5017,
      lng: -73.5673,
      display_name: 'Montreal, QC',
      name: 'Montreal',
      province: 'QC',
    });

    vi.useRealTimers();
  });

  it('text modification after selection clears coords — onChange(null) called', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetchSuccess();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handleChange = vi.fn();

    const initialValue = {
      lat: 45.5017,
      lng: -73.5673,
      display_name: 'Montreal, QC',
    };

    render(<LocationAutocomplete value={initialValue} onChange={handleChange} />);

    const input = screen.getByRole('textbox');

    // Simulate typing after a selection is already set
    await user.type(input, 'x');

    expect(handleChange).toHaveBeenCalledWith(null);

    vi.useRealTimers();
  });

  it('clear button sets null — onChange(null) called when X is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    const initialValue = {
      lat: 45.5017,
      lng: -73.5673,
      display_name: 'Montreal, QC',
    };

    render(<LocationAutocomplete value={initialValue} onChange={handleChange} />);

    // The X button appears when there is text in the input
    const clearButton = screen.getByRole('button');
    await user.click(clearButton);

    expect(handleChange).toHaveBeenCalledWith(null);
  });

  it('API error shows message — error text is displayed when fetch fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetchError();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const handleChange = vi.fn();

    render(<LocationAutocomplete value={null} onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Mon');

    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeVisible();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load location results/i);

    vi.useRealTimers();
  });
});
