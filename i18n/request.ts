import {getRequestConfig} from 'next-intl/server';
import {routing} from './routing';

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  // Validate locale is one of the supported locales, fallback to default if not
  const validLocales = routing.locales as readonly string[];
  const locale = (requested && validLocales.includes(requested))
    ? requested
    : routing.defaultLocale;
  
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
