import { describe, expect, it } from 'vitest';
import { parseOrgIndexSearchParams } from './params';

describe('parseOrgIndexSearchParams', () => {
  it('canonicalizes legacy sector URL values and preserves unknowns', () => {
    const params = new URLSearchParams();
    params.append('sector', 'care-health-social-services');
    params.append('sector', '  arts-culture-information  ');
    params.append('sector', 'not-a-real-sector');
    params.append('sector', 'social-health-care-services');

    const parsed = parseOrgIndexSearchParams(params, false);
    expect(parsed.sectors).toEqual([
      'social-health-care-services',
      'arts-culture-media',
      'not-a-real-sector',
    ]);
  });
});
