import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ValuesSelector from './ValuesSelector'
import { VALUES_LIST, getValueDefinition } from '@/lib/values'

describe('ValuesSelector', () => {
  describe('view mode (isEditing = false)', () => {
    it('shows a dash when no values are selected', () => {
      render(
        <ValuesSelector
          selectedValues={[]}
          onValuesChange={() => {}}
          isEditing={false}
        />
      )

      expect(screen.getByText('-')).toBeVisible()
    })

    it('renders selected values with descriptions and examples', () => {
      const values = [VALUES_LIST[0], VALUES_LIST[1]]
      render(
        <ValuesSelector
          selectedValues={values}
          onValuesChange={() => {}}
          isEditing={false}
        />
      )

      const firstDef = getValueDefinition(values[0])
      const secondDef = getValueDefinition(values[1])

      expect(screen.getByText(values[0])).toBeVisible()
      expect(screen.getByText(firstDef.description)).toBeVisible()
      expect(screen.getByText(firstDef.example)).toBeVisible()

      expect(screen.getByText(values[1])).toBeVisible()
      expect(screen.getByText(secondDef.description)).toBeVisible()
      expect(screen.getByText(secondDef.example)).toBeVisible()
    })

    it('does not render toggle buttons in view mode', () => {
      render(
        <ValuesSelector
          selectedValues={[VALUES_LIST[0]]}
          onValuesChange={() => {}}
          isEditing={false}
        />
      )

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('edit mode (isEditing = true)', () => {
    it('renders all values from VALUES_LIST as toggle buttons', () => {
      render(
        <ValuesSelector
          selectedValues={[]}
          onValuesChange={() => {}}
          isEditing={true}
        />
      )

      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(VALUES_LIST.length)
    })

    it('shows selection count', () => {
      render(
        <ValuesSelector
          selectedValues={[VALUES_LIST[0], VALUES_LIST[2]]}
          onValuesChange={() => {}}
          isEditing={true}
        />
      )

      expect(screen.getByText(/2 selected/)).toBeVisible()
    })

    it('marks selected values with aria-pressed="true"', () => {
      const selected = VALUES_LIST[0]
      render(
        <ValuesSelector
          selectedValues={[selected]}
          onValuesChange={() => {}}
          isEditing={true}
        />
      )

      expect(screen.getByRole('button', { name: new RegExp(selected), pressed: true })).toBeVisible()
    })

    it('marks unselected values with aria-pressed="false"', () => {
      render(
        <ValuesSelector
          selectedValues={[]}
          onValuesChange={() => {}}
          isEditing={true}
        />
      )

      const firstButton = screen.getByRole('button', { name: new RegExp(VALUES_LIST[0]), pressed: false })
      expect(firstButton).toBeVisible()
    })

    it('calls onValuesChange to add a value when clicking an unselected button', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      const target = VALUES_LIST[1]

      render(
        <ValuesSelector
          selectedValues={[VALUES_LIST[0]]}
          onValuesChange={handleChange}
          isEditing={true}
        />
      )

      await user.click(screen.getByRole('button', { name: new RegExp(target) }))
      expect(handleChange).toHaveBeenCalledWith([VALUES_LIST[0], target])
    })

    it('calls onValuesChange to remove a value when clicking a selected button', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      const toRemove = VALUES_LIST[0]

      render(
        <ValuesSelector
          selectedValues={[toRemove, VALUES_LIST[1]]}
          onValuesChange={handleChange}
          isEditing={true}
        />
      )

      await user.click(screen.getByRole('button', { name: new RegExp(toRemove) }))
      expect(handleChange).toHaveBeenCalledWith([VALUES_LIST[1]])
    })

    it('displays description and example for each value', () => {
      const value = VALUES_LIST[0]
      const def = getValueDefinition(value)

      render(
        <ValuesSelector
          selectedValues={[]}
          onValuesChange={() => {}}
          isEditing={true}
        />
      )

      expect(screen.getByText(def.description)).toBeVisible()
      expect(screen.getByText(def.example)).toBeVisible()
    })
  })
})
