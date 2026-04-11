import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PillSelector from './PillSelector';

const options = ['Remote', 'Hybrid', 'Office'] as const;

describe('PillSelector', () => {
  it('renders all options as buttons', () => {
    render(<PillSelector options={options} selectedOptions={[]} onSelectionChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Remote' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hybrid' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Office' })).toBeVisible();
  });

  it('calls onSelectionChange with the toggled option added (multi-select)', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PillSelector options={options} selectedOptions={[]} onSelectionChange={handleChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Hybrid' }));
    expect(handleChange).toHaveBeenCalledWith(['Hybrid']);
  });

  it('calls onSelectionChange with the option removed when already selected (multi-select)', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PillSelector
        options={options}
        selectedOptions={['Remote', 'Office']}
        onSelectionChange={handleChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remote' }));
    expect(handleChange).toHaveBeenCalledWith(['Office']);
  });

  it('replaces the selection in single-select mode', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PillSelector
        options={options}
        selectedOptions={['Remote']}
        onSelectionChange={handleChange}
        multiSelect={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Office' }));
    expect(handleChange).toHaveBeenCalledWith(['Office']);
  });

  it('applies selected styling to active options', () => {
    render(
      <PillSelector options={options} selectedOptions={['Hybrid']} onSelectionChange={() => {}} />,
    );

    const hybridBtn = screen.getByRole('button', { name: 'Hybrid' });
    expect(hybridBtn).toHaveStyle({ background: 'var(--primary)' });

    const remoteBtn = screen.getByRole('button', { name: 'Remote' });
    expect(remoteBtn).toHaveStyle({ background: 'var(--background)' });
  });
});
