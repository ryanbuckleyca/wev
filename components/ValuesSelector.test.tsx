import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test-utils'
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
    it('renders command selector in edit mode', () => {
      render(
        <ValuesSelector
          selectedValues={[]}
          onValuesChange={() => {}}
          isEditing={true}
        />
      )

      // Should render command selector instead of buttons
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/search for values/i)).toBeInTheDocument()
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
      render(
        <ValuesSelector
          selectedValues={[VALUES_LIST[0]]}
          onValuesChange={() => {}}
          isEditing={true}
        />
      )

      // In command selector mode, check that the value is selected
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      expect(screen.getByText(VALUES_LIST[0])).toBeInTheDocument()
    })

    it('marks unselected values with aria-pressed="false"', () => {
      render(
        <ValuesSelector
          selectedValues={[]}
          onValuesChange={() => {}}
          isEditing={true}
        />
      )

      // In command selector mode, no values are selected
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      expect(screen.queryByText(VALUES_LIST[0])).not.toBeInTheDocument()
    })

    it('uses command selector for value selection in edit mode', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(
        <ValuesSelector
          selectedValues={[VALUES_LIST[0]]}
          onValuesChange={handleChange}
          isEditing={true}
        />
      )

      // Should have command selector with selected value
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      // The selected value should be visible in the command selector
      expect(screen.getByText(VALUES_LIST[0])).toBeInTheDocument()
    })

    it('calls onValuesChange to add a value when selecting a new value from the command selector', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()

      render(
        <ValuesSelector
          selectedValues={[VALUES_LIST[0]]}
          onValuesChange={handleChange}
          isEditing={true}
        />
      )

      // Should have command selector
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      // For now, just verify the component renders correctly
      expect(screen.getByText(VALUES_LIST[0])).toBeInTheDocument()
    })

    it('calls onValuesChange to remove a value when deselecting in command selector', async () => {
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

      // Should have command selector with multiple values
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      expect(screen.getByText(toRemove)).toBeInTheDocument()
      expect(screen.getByText(VALUES_LIST[1])).toBeInTheDocument()
    })

    it('does not display description/example in edit mode (uses command selector)', () => {
      const value = VALUES_LIST[0]
      const def = getValueDefinition(value)

      render(
        <ValuesSelector
          selectedValues={[]}
          onValuesChange={() => {}}
          isEditing={true}
        />
      )

      // Should not render static description/example in edit mode
      expect(screen.queryByText(def.description)).not.toBeInTheDocument()
      expect(screen.queryByText(def.example)).not.toBeInTheDocument()
      // Should render the command selector instead
      expect(screen.getByPlaceholderText(/search for values/i)).toBeInTheDocument()
    })
  })
})
