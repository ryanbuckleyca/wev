'use client';

import { useLayoutEffect } from 'react';

interface HtmlLangSyncProps {
  lang: string;
}

export default function HtmlLangSync({ lang }: HtmlLangSyncProps) {
  useLayoutEffect(() => {
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  return null;
}
