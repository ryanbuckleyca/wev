import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RadioFilterSection from './RadioFilterSection';

describe('RadioFilterSection', () => {
  const options = [
    { value: 'all', label: 'All organizations' },
    { value: '28d', label: 'Hiring in the last 4 weeks' },
    { value: '90d', label: 'Hiring in the last 3 months' },
  ];

  it('selects one option at a time', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    const { rerender } = render(
      <RadioFilterSection
        label="Activity"
        name="org-activity"
        options={options}
        selectedValue="all"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('radio', { name: 'All organizations' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Hiring in the last 4 weeks' })).not.toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Hiring in the last 4 weeks' }));
    expect(onSelect).toHaveBeenCalledWith('28d');

    rerender(
      <RadioFilterSection
        label="Activity"
        name="org-activity"
        options={options}
        selectedValue="28d"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('radio', { name: 'All organizations' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Hiring in the last 4 weeks' })).toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'Activity' })).toBeInTheDocument();
  });

  it('names the radiogroup when the section label is not a string', () => {
    render(
      <RadioFilterSection
        label={<span>Activity</span>}
        name="org-activity"
        options={options}
        selectedValue="all"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Activity' })).toBeInTheDocument();
  });
});
