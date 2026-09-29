'use client';

import { useLayoutEffect } from 'react';

interface HtmlLangSyncProps {
  lang: string;
}

/** Sets `<html lang>` from the active locale before paint (static root defaults to en). */
export default function HtmlLangSync({ lang }: HtmlLangSyncProps) {
  useLayoutEffect(() => {
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  return null;
}
