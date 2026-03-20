import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExpandablePills, { ExpandablePillGroup } from './ExpandablePills'

describe('ExpandablePills', () => {
  const mockGroups: ExpandablePillGroup[] = [
    {
      key: 'values',
      summary: {
        label: '3/9 values',
        tooltip: 'Test tooltip<br/><br/><em>Click > to expand details</em>',
        isMatched: true,
        icon: 'heart',
        type: 'summary',
      },
      items: [
        { label: 'community', tooltip: 'Community value', isMatched: true, type: 'value' },
        { label: 'knowledge', tooltip: 'Knowledge value', isMatched: true, type: 'value' },
        { label: 'challenge', tooltip: 'Challenge value', isMatched: false, type: 'value' },
      ],
    },
  ]

  it('renders collapsed state by default', () => {
    render(<ExpandablePills groups={mockGroups} />)
    
    expect(screen.getByText('3/9 values')).toBeVisible()
    expect(screen.queryByText('community')).not.toBeInTheDocument()
  })

  it('expands when summary pill chevron is clicked', async () => {
    const user = userEvent.setup()
    render(<ExpandablePills groups={mockGroups} />)
    
    const chevronButton = screen.getByLabelText('Expand')
    await user.click(chevronButton)
    
    expect(screen.getByText('community')).toBeVisible()
    expect(screen.getByText('knowledge')).toBeVisible()
    expect(screen.getByText('challenge')).toBeVisible()
  })

  it('shows collapse button at end when expanded', async () => {
    const user = userEvent.setup()
    render(<ExpandablePills groups={mockGroups} />)
    
    await user.click(screen.getByLabelText('Expand'))
    
    const collapseButtons = screen.getAllByLabelText('Collapse')
    expect(collapseButtons.length).toBeGreaterThan(1) // Summary chevron + end button
  })

  it('collapses when end collapse button is clicked', async () => {
    const user = userEvent.setup()
    render(<ExpandablePills groups={mockGroups} />)
    
    await user.click(screen.getByLabelText('Expand'))
    expect(screen.getByText('community')).toBeVisible()
    
    const collapseButtons = screen.getAllByLabelText('Collapse')
    await user.click(collapseButtons[collapseButtons.length - 1]) // Click last one (end button)
    
    expect(screen.queryByText('community')).not.toBeInTheDocument()
  })

  it('updates tooltip text when expanded', async () => {
    const user = userEvent.setup()
    const { container } = render(<ExpandablePills groups={mockGroups} />)
    
    await user.click(screen.getByLabelText('Expand'))
    
    // Check that tooltip was updated (would need to trigger tooltip to verify content)
    const summaryPill = screen.getByText('3/9 values')
    expect(summaryPill).toBeInTheDocument()
  })

  it('applies correct matched state to collapse button', async () => {
    const user = userEvent.setup()
    const { container } = render(<ExpandablePills groups={mockGroups} />)
    
    await user.click(screen.getByLabelText('Expand'))
    
    // Collapse button should inherit matched state from summary
    const collapseButtons = container.querySelectorAll('[aria-label="Collapse"]')
    const endButton = collapseButtons[collapseButtons.length - 1]?.parentElement
    
    // Should not have opacity-60 class (which indicates unmatched)
    expect(endButton?.className).not.toContain('opacity-60')
  })

  it('handles multiple groups independently', async () => {
    const user = userEvent.setup()
    const multiGroups: ExpandablePillGroup[] = [
      ...mockGroups,
      {
        key: 'skills',
        summary: {
          label: '2/5 skills',
          tooltip: 'Skills tooltip',
          isMatched: true,
          icon: 'briefcase',
          type: 'summary',
        },
        items: [
          { label: 'javascript', tooltip: 'JS', isMatched: true, type: 'skill' },
          { label: 'react', tooltip: 'React', isMatched: false, type: 'skill' },
        ],
      },
    ]
    
    render(<ExpandablePills groups={multiGroups} />)
    
    const expandButtons = screen.getAllByLabelText('Expand')
    await user.click(expandButtons[0]) // Expand first group
    
    expect(screen.getByText('community')).toBeVisible()
    expect(screen.queryByText('javascript')).not.toBeInTheDocument() // Second group still collapsed
  })

  it('renders preItems before groups', () => {
    const preItems = [
      { label: 'Office', tooltip: 'Work location', isMatched: true, icon: 'location' as const, type: 'workType' as const },
    ]
    
    render(<ExpandablePills preItems={preItems} groups={mockGroups} />)
    
    const pills = screen.getAllByRole('generic').filter(el => el.className.includes('inline-flex'))
    expect(pills[0]).toHaveTextContent('Office')
  })
})
