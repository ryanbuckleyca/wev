import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react/pure';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from './messages/en.json';
import frMessages from './messages/fr.json';

const messagesByLocale: Record<string, typeof enMessages> = {
  en: enMessages,
  fr: frMessages,
};

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllProviders, ...options });

/** Render with a specific locale (defaults to 'en'). */
function renderWithLocale(
  ui: ReactElement,
  locale: string = 'en',
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  const messages = messagesByLocale[locale] ?? enMessages;
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

// re-export everything from testing-library
export * from '@testing-library/react/pure';

// override render
export { customRender as render, renderWithLocale };
