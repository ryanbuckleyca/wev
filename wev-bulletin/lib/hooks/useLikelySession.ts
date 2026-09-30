'use client';

import { useLayoutEffect, useState } from 'react';
import { hasSupabaseAuthCookieInBrowser } from '@/lib/supabase/auth-cookie';

export type LikelySessionState = {
  /**
   * False on the SSR/hydration render before the cookie is read.
   * True after useLayoutEffect (before paint).
   */
  checked: boolean;
  /** True when a Supabase auth cookie is present in the browser. */
  likely: boolean;
};

/**
 * Synchronously-after-hydration session hint.
 *
 * First render always returns `{ checked: false, likely: false }` so it matches
 * anonymous-cached SSR HTML. Before paint, the layout effect reads the cookie
 * and flips `checked` (and `likely` when signed in) so logged-in users can
 * discard the anonymous shell and show a skeleton instead.
 */
export function useLikelySession(): LikelySessionState {
  const [state, setState] = useState<LikelySessionState>({
    checked: false,
    likely: false,
  });

  useLayoutEffect(() => {
    setState({
      checked: true,
      likely: hasSupabaseAuthCookieInBrowser(),
    });
  }, []);

  return state;
}
