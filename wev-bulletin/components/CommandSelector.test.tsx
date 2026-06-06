import { render, screen, fireEvent } from '@/test-utils';
import CommandSelector from './CommandSelector';
import { describe, expect, it, vi } from 'vitest';

const options = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
];

describe('CommandSelector', () => {
  it('renders correctly with placeholder', () => {
    render(
      <CommandSelector
        selectedOptions={[]}
        onOptionsChange={vi.fn()}
        placeholder="Select an option"
        noResultsText="No results"
        query=""
        onQueryChange={vi.fn()}
        availableOptions={options}
      />,
    );
    expect(screen.getByPlaceholderText('Select an option')).toBeInTheDocument();
  });

  it('displays selected options as pills', () => {
    render(
      <CommandSelector
        selectedOptions={[options[0]]}
        onOptionsChange={vi.fn()}
        placeholder="Select an option"
        noResultsText="No results"
        query=""
        onQueryChange={vi.fn()}
        availableOptions={options}
      />,
    );
    expect(screen.getByText('Option 1')).toBeInTheDocument();
  });

  it('calls onQueryChange when typing', () => {
    const onQueryChange = vi.fn();
    render(
      <CommandSelector
        selectedOptions={[]}
        onOptionsChange={vi.fn()}
        placeholder="Select an option"
        noResultsText="No results"
        query=""
        onQueryChange={onQueryChange}
        availableOptions={options}
      />,
    );
    const input = screen.getByPlaceholderText('Select an option');
    fireEvent.change(input, { target: { value: 'test' } });
    // cmdk handles change events, so we check if onQueryChange was called
    expect(onQueryChange).toHaveBeenCalledWith('test');
  });
});
