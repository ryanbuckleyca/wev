import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import ValuesSelector from './profile/ValuesSelector'
import { VALUES_LIST, buildWorkValues } from '@/lib/values'

describe('ValuesSelector', () => {
  // Create mock translation functions
  const mockTEn = (key: string, opts?: { defaultValue: string }) => opts?.defaultValue || key
  const mockTFr = (key: string, opts?: { defaultValue: string }) => opts?.defaultValue || key
  
  const mockValues = buildWorkValues(mockTEn, mockTFr)
  const locale = 'en'

  describe('rendering', () => {
    it('renders all category groups', () => {
      render(
        <ValuesSelector
          values={mockValues}
          selected={[]}
          onToggle={() => {}}
          locale={locale}
        />
      )

      // Should render category headers
      const categories = new Set(mockValues.map(v => v.category[locale]))
      categories.forEach(category => {
        expect(screen.getByText(category)).toBeInTheDocument()
      })
    })

    it('shows selection count for each category', () => {
      const selectedIds = [mockValues[0].id, mockValues[1].id]
      render(
        <ValuesSelector
          values={mockValues}
          selected={selectedIds}
          onToggle={() => {}}
          locale={locale}
        />
      )

      // Should show "X / Y selected" for each category
      expect(screen.getAllByText(/\d+ \/ \d+ selected/)).toHaveLength(
        new Set(mockValues.map(v => v.category[locale])).size
      )
    })

    it('categories are collapsed by default', () => {
      render(
        <ValuesSelector
          values={mockValues}
          selected={[]}
          onToggle={() => {}}
          locale={locale}
        />
      )

      // Value labels should not be visible when collapsed
      mockValues.forEach(value => {
        expect(screen.queryByText(value.label[locale])).not.toBeInTheDocument()
      })
    })
  })

  describe('category expansion', () => {
    it('expands category when clicked', async () => {
      const user = userEvent.setup()
      render(
        <ValuesSelector
          values={mockValues}
          selected={[]}
          onToggle={() => {}}
          locale={locale}
        />
      )

      const firstCategory = mockValues[0].category[locale]
      const categoryHeader = screen.getByText(firstCategory)
      
      await user.click(categoryHeader)

      // Value labels should now be visible
      const valuesInCategory = mockValues.filter(v => v.category[locale] === firstCategory)
      valuesInCategory.forEach(value => {
        expect(screen.getByText(value.label[locale])).toBeInTheDocument()
      })
    })

    it('collapses category when clicked again', async () => {
      const user = userEvent.setup()
      render(
        <ValuesSelector
          values={mockValues}
          selected={[]}
          onToggle={() => {}}
          locale={locale}
        />
      )

      const firstCategory = mockValues[0].category[locale]
      const categoryHeader = screen.getByText(firstCategory)
      
      // Expand
      await user.click(categoryHeader)
      const firstValue = mockValues.find(v => v.category[locale] === firstCategory)!
      expect(screen.getByText(firstValue.label[locale])).toBeInTheDocument()

      // Collapse
      await user.click(categoryHeader)
      expect(screen.queryByText(firstValue.label[locale])).not.toBeInTheDocument()
    })
  })

  describe('value selection', () => {
    it('calls onToggle when a value is clicked', async () => {
      const user = userEvent.setup()
      const handleToggle = vi.fn()
      render(
        <ValuesSelector
          values={mockValues}
          selected={[]}
          onToggle={handleToggle}
          locale={locale}
        />
      )

      // Expand first category
      const firstCategory = mockValues[0].category[locale]
      await user.click(screen.getByText(firstCategory))

      // Click first value
      const firstValue = mockValues.find(v => v.category[locale] === firstCategory)!
      await user.click(screen.getByText(firstValue.label[locale]))

      expect(handleToggle).toHaveBeenCalledWith(firstValue.id)
    })

    it('shows checkboxes as checked for selected values', async () => {
      const user = userEvent.setup()
      const selectedValue = mockValues[0]
      render(
        <ValuesSelector
          values={mockValues}
          selected={[selectedValue.id]}
          onToggle={() => {}}
          locale={locale}
        />
      )

      // Expand category
      await user.click(screen.getByText(selectedValue.category[locale]))

      // Find the checkbox for the selected value
      const valueButton = screen.getByText(selectedValue.label[locale]).closest('button')
      const checkbox = valueButton?.querySelector('input[type="checkbox"]')
      expect(checkbox).toBeChecked()
    })
  })

  describe('category-level selection', () => {
    it('calls onToggleMultiple when category checkbox is clicked', async () => {
      const user = userEvent.setup()
      const handleToggleMultiple = vi.fn()
      render(
        <ValuesSelector
          values={mockValues}
          selected={[]}
          onToggle={() => {}}
          onToggleMultiple={handleToggleMultiple}
          locale={locale}
        />
      )

      // Find and click the first category checkbox
      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])

      expect(handleToggleMultiple).toHaveBeenCalled()
      const [ids, shouldSelect] = handleToggleMultiple.mock.calls[0]
      expect(Array.isArray(ids)).toBe(true)
      expect(typeof shouldSelect).toBe('boolean')
    })

    it('shows indeterminate state when some values in category are selected', async () => {
      const user = userEvent.setup()
      const firstCategory = mockValues[0].category[locale]
      const valuesInCategory = mockValues.filter(v => v.category[locale] === firstCategory)
      
      // Select only first value in category
      render(
        <ValuesSelector
          values={mockValues}
          selected={[valuesInCategory[0].id]}
          onToggle={() => {}}
          onToggleMultiple={() => {}}
          locale={locale}
        />
      )

      // The category checkbox should be indeterminate if there are multiple values
      if (valuesInCategory.length > 1) {
        const categoryCheckboxes = screen.getAllByRole('checkbox')
        const firstCategoryCheckbox = categoryCheckboxes[0] as HTMLInputElement
        
        // Check the indeterminate property on the DOM element
        expect(firstCategoryCheckbox.indeterminate).toBe(true)
      }
    })
  })

  describe('localization', () => {
    it('renders French labels when locale is fr', () => {
      render(
        <ValuesSelector
          values={mockValues}
          selected={[]}
          onToggle={() => {}}
          locale="fr"
        />
      )

      // Should render French category names
      const categories = new Set(mockValues.map(v => v.category.fr))
      categories.forEach(category => {
        expect(screen.getByText(category)).toBeInTheDocument()
      })
    })

    it('shows "sélectionnés" in French', () => {
      render(
        <ValuesSelector
          values={mockValues}
          selected={[mockValues[0].id]}
          onToggle={() => {}}
          locale="fr"
        />
      )

      expect(screen.getAllByText(/sélectionnés/)).toHaveLength(
        new Set(mockValues.map(v => v.category.fr)).size
      )
    })
  })
})
