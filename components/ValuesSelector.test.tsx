import { describe, it, expect, vi } from 'vitest'
import { render, screen, renderWithLocale } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import ValuesSelector from './profile/ValuesSelector'
import { buildWorkValues } from '@/lib/values'
import enMessages from '@/messages/en.json'
import frMessages from '@/messages/fr.json'

describe('ValuesSelector', () => {
  const mockTEn = (key: string, opts?: { defaultValue: string }) =>
    opts?.defaultValue || key
  const mockTFr = (key: string, opts?: { defaultValue: string }) =>
    opts?.defaultValue || key

  const mockValues = buildWorkValues(mockTEn, mockTFr)
  const locale = 'en' as const

  const baseProps = {
    values: mockValues,
    valueCutoff: 5,
    onReorder: () => {},
    onRemove: () => {},
    onToggle: () => {},
    locale,
  }

  async function openModal(user: ReturnType<typeof userEvent.setup>) {
    const trigger = screen.getByRole('button', {
      name: enMessages.profile.valuesPlaceholder,
    })
    await user.click(trigger)
  }

  describe('rendering', () => {
    it('renders search trigger with profile placeholder', () => {
      render(<ValuesSelector {...baseProps} selectedValues={[]} />)

      expect(
        screen.getByRole('button', {
          name: enMessages.profile.valuesPlaceholder,
        }),
      ).toBeVisible()
    })

    it('opens modal with all category groups', async () => {
      const user = userEvent.setup()
      render(<ValuesSelector {...baseProps} selectedValues={[]} />)

      await openModal(user)

      const categories = new Set(mockValues.map((v) => v.category[locale]))
      categories.forEach((category) => {
        expect(screen.getByText(category)).toBeVisible()
      })
    })

    it('categories are collapsed by default inside modal', async () => {
      const user = userEvent.setup()
      render(<ValuesSelector {...baseProps} selectedValues={[]} />)

      await openModal(user)

      mockValues.forEach((value) => {
        expect(screen.queryByText(value.label[locale])).not.toBeInTheDocument()
      })
    })
  })

  describe('category expansion', () => {
    it('expands category when header clicked', async () => {
      const user = userEvent.setup()
      render(<ValuesSelector {...baseProps} selectedValues={[]} />)

      await openModal(user)

      const firstCategory = mockValues[0].category[locale]
      await user.click(screen.getByText(firstCategory))

      const valuesInCategory = mockValues.filter(
        (v) => v.category[locale] === firstCategory,
      )
      valuesInCategory.forEach((value) => {
        expect(screen.getByText(value.label[locale])).toBeVisible()
      })
    })

    it('collapses category when header clicked again', async () => {
      const user = userEvent.setup()
      render(<ValuesSelector {...baseProps} selectedValues={[]} />)

      await openModal(user)

      const firstCategory = mockValues[0].category[locale]
      const categoryHeader = screen.getByText(firstCategory)

      await user.click(categoryHeader)
      const firstValue = mockValues.find(
        (v) => v.category[locale] === firstCategory,
      )!
      expect(screen.getByText(firstValue.label[locale])).toBeVisible()

      await user.click(categoryHeader)
      expect(
        screen.queryByText(firstValue.label[locale]),
      ).not.toBeInTheDocument()
    })
  })

  describe('value selection', () => {
    it('calls onToggle when a value row is clicked', async () => {
      const user = userEvent.setup()
      const handleToggle = vi.fn()
      render(
        <ValuesSelector {...baseProps} selectedValues={[]} onToggle={handleToggle} />,
      )

      await openModal(user)

      const firstCategory = mockValues[0].category[locale]
      await user.click(screen.getByText(firstCategory))

      const firstValue = mockValues.find(
        (v) => v.category[locale] === firstCategory,
      )!
      await user.click(screen.getByText(firstValue.label[locale]))

      expect(handleToggle).toHaveBeenCalledWith(firstValue.id)
    })

    it('shows checkbox checked for selected values', async () => {
      const user = userEvent.setup()
      const selectedValue = mockValues[0]
      render(
        <ValuesSelector
          {...baseProps}
          selectedValues={[selectedValue.id]}
          onToggle={() => {}}
        />,
      )

      await openModal(user)
      await user.click(screen.getByText(selectedValue.category[locale]))

      const label = selectedValue.label[locale]
      const rowWithCheckbox = screen
        .getAllByRole('button')
        .find(
          (b) =>
            b.querySelector('input[type="checkbox"]') !== null &&
            b.textContent?.includes(label),
        )
      expect(rowWithCheckbox).toBeTruthy()
      const checkbox = rowWithCheckbox!.querySelector('input[type="checkbox"]')
      expect(checkbox).toBeChecked()
    })
  })

  describe('localization', () => {
    it('renders French category labels in modal', async () => {
      const user = userEvent.setup()
      renderWithLocale(
        <ValuesSelector {...baseProps} selectedValues={[]} locale="fr" />,
        'fr',
      )

      await user.click(
        screen.getByRole('button', {
          name: frMessages.profile.valuesPlaceholder,
        }),
      )

      const categories = new Set(mockValues.map((v) => v.category.fr))
      categories.forEach((category) => {
        expect(screen.getByText(category)).toBeVisible()
      })
    })

    it('shows Done control with French label', async () => {
      const user = userEvent.setup()
      renderWithLocale(
        <ValuesSelector {...baseProps} selectedValues={[]} locale="fr" />,
        'fr',
      )

      await user.click(
        screen.getByRole('button', {
          name: frMessages.profile.valuesPlaceholder,
        }),
      )

      expect(
        screen.getByRole('button', { name: frMessages.profile.valuesDone }),
      ).toBeVisible()
    })
  })
})
