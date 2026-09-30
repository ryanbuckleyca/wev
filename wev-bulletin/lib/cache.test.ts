import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PUBLIC_REVALIDATE_SECONDS } from './cache';

/** App Router pages that export ISR `revalidate` for anonymous CDN shells. */
const PAGE_SEGMENT_FILES = [
  'app/[locale]/page.tsx',
  'app/[locale]/jobs/page.tsx',
  'app/[locale]/emplois/page.tsx',
  'app/[locale]/organizations/page.tsx',
  'app/[locale]/organizations/[slug]/page.tsx',
] as const;

describe('PUBLIC_REVALIDATE_SECONDS', () => {
  it('matches the literal export const revalidate on public pages', () => {
    const root = join(__dirname, '..');
    const expected = `export const revalidate = ${PUBLIC_REVALIDATE_SECONDS};`;

    for (const relative of PAGE_SEGMENT_FILES) {
      const source = readFileSync(join(root, relative), 'utf8');
      expect(source, relative).toContain(expected);
    }
  });
});
