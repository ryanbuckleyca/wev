import { describe, it, expect } from 'vitest';
import { render, screen, renderWithLocale } from '@/test-utils';
import Pagination from '@/components/Pagination';
import Pill from '@/components/Pill';
import enMessages from '@/messages/en.json';
import frMessages from '@/messages/fr.json';
import { vi } from 'vitest';

vi.mock('@/contexts/BulletinFilterContext', () => ({
  useBulletinFilterContext: () => ({
    currentPage: 1,
    setCurrentPage: vi.fn(),
  }),
}));

/**
 * Integration tests verifying that i18n is wired up correctly:
 * - components render English text by default
 * - components render French text when locale is 'fr'
 * - both message files have the same keys (no missing translations)
 */

const paginationProps = {
  totalPages: 5,
  totalItems: 50,
  itemsPerPage: 10,
} as const;

describe('i18n integration', () => {
  describe('message file completeness', () => {
    function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
      return Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    }

    it('en.json and fr.json have the same translation keys', () => {
      const enKeys = new Set(flatKeys(enMessages));
      const frKeys = new Set(flatKeys(frMessages));

      const missingInFr = Array.from(enKeys).filter((k) => !frKeys.has(k));
      const missingInEn = Array.from(frKeys).filter((k) => !enKeys.has(k));

      expect(missingInFr, 'Keys in en.json but missing in fr.json').toEqual([]);
      expect(missingInEn, 'Keys in fr.json but missing in en.json').toEqual([]);
    });

    it('neither message file is empty', () => {
      expect(Object.keys(enMessages).length).toBeGreaterThan(0);
      expect(Object.keys(frMessages).length).toBeGreaterThan(0);
    });
  });

  describe('English locale (default)', () => {
    it('renders Pagination with English text', () => {
      render(<Pagination {...paginationProps} />);

      expect(screen.getByLabelText('Previous')).toBeInTheDocument();
      expect(screen.getByLabelText('Next')).toBeInTheDocument();
      expect(screen.getByText(/Showing 1-10 of 50 jobs/)).toBeVisible();
    });

    it('renders Pill with English remove label', () => {
      const removeLabel = enMessages.ariaLabels.pill.remove.replace('{label}', 'Tag');
      render(
        <Pill removable onRemove={() => {}} removeAriaLabel={removeLabel}>
          Tag
        </Pill>,
      );
      expect(screen.getByRole('button', { name: /remove tag/i })).toBeVisible();
    });
  });

  describe('French locale', () => {
    it('renders Pagination with French text', () => {
      renderWithLocale(<Pagination {...paginationProps} />, 'fr');

      expect(screen.getByLabelText('Précédent')).toBeInTheDocument();
      expect(screen.getByLabelText('Suivant')).toBeInTheDocument();
      expect(screen.getByText(/Affichage 1-10 de 50 emplois/)).toBeVisible();
    });

    it('renders Pill with French remove label', () => {
      const removeLabel = frMessages.ariaLabels.pill.remove.replace('{label}', 'Étiquette');
      renderWithLocale(
        <Pill removable onRemove={() => {}} removeAriaLabel={removeLabel}>
          Étiquette
        </Pill>,
        'fr',
      );
      expect(screen.getByRole('button', { name: /retirer étiquette/i })).toBeVisible();
    });
  });

  describe('locale switching', () => {
    it('same component renders differently per locale', () => {
      const ui = <Pagination {...paginationProps} totalPages={1} totalItems={3} />;

      const { unmount } = renderWithLocale(ui, 'en');
      expect(screen.getByText(/3 jobs/)).toBeVisible();
      unmount();

      renderWithLocale(ui, 'fr');
      expect(screen.getByText(/3 emplois/)).toBeVisible();
    });
  });
});
