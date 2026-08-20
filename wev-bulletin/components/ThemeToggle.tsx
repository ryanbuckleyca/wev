'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import RoundToggle from './RoundToggle';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { MoonHalfRight5Solid, Sun1Solid } from '@lineiconshq/free-icons';

const THEME_TRANSITION_MS = 300;

export type ThemePreference = 'light' | 'dark';

type ThemeToggleProps = {
  /** Must match server `<html data-theme>` (from `theme` cookie in locale layout) so SSR and hydration agree. */
  initialTheme?: ThemePreference;
};

export default function ThemeToggle({ initialTheme = 'dark' }: ThemeToggleProps) {
  const t = useTranslations('ariaLabels.themeToggle');
  const [theme, setTheme] = useState<ThemePreference>(initialTheme);
  const transitionTimeoutRef = useRef<number | null>(null);

  // After hydration, sync with `data-theme` on `<html>` (blocking script may apply localStorage).
  useEffect(() => {
    const fromDom = document.documentElement.getAttribute('data-theme');
    if (fromDom !== 'dark' && fromDom !== 'light') return;
    const frame = requestAnimationFrame(() => {
      setTheme((current) => (current === fromDom ? current : fromDom));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
      document.documentElement.classList.remove('theme-switching');
    };
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    setTheme(next);

    root.classList.add('theme-switching');
    // Force style recalculation so transition styles apply before theme vars change.
    void document.body.offsetHeight;

    root.setAttribute('data-theme', next);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('theme', next);
      }
    } catch {}
    // Persist to cookie so the server layout can include data-theme on <html>
    // during soft navigations (e.g. locale switches).
    document.cookie = `theme=${next};path=/;max-age=31536000;SameSite=Lax`;

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
    }
    transitionTimeoutRef.current = window.setTimeout(() => {
      root.classList.remove('theme-switching');
      transitionTimeoutRef.current = null;
    }, THEME_TRANSITION_MS);
  };

  return (
    <RoundToggle>
      <button
        type="button"
        onClick={toggle}
        className={`relative flex py-1 w-14 items-center justify-start rounded-full transition-all duration-500 ease-in-out h-full ${
          theme === 'dark' ? 'bg-background' : 'bg-background'
        }`}
        aria-label={theme === 'dark' ? t('switchToLight') : t('switchToDark')}
      >
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-all duration-500 ease-in-out ${
            theme === 'dark' ? 'ml-auto mr-0.5' : 'ml-0.5'
          } bg-card`}
        >
          {theme === 'dark' ? (
            <Lineicons icon={Sun1Solid} size={16} className="text-[var(--warn-text)]" />
          ) : (
            <Lineicons icon={MoonHalfRight5Solid} size={16} className="text-[var(--warn-solid)]" />
          )}
        </span>
      </button>
    </RoundToggle>
  );
}
