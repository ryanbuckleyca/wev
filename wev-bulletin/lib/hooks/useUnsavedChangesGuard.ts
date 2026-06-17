'use client';

import { useCallback, useEffect, useRef } from 'react';

const UNSAVED_CHANGES_CONFIRMED = Symbol.for('wev.unsavedChangesConfirmed');

type ConfirmableEvent = Event & {
  [UNSAVED_CHANGES_CONFIRMED]?: boolean;
};

type UseUnsavedChangesGuardOptions = {
  enabled: boolean;
  message: string;
};

export function markUnsavedChangesConfirmed(event: Event | undefined) {
  if (!event) return;
  (event as ConfirmableEvent)[UNSAVED_CHANGES_CONFIRMED] = true;
}

export function wasUnsavedChangesConfirmed(event: Event | undefined) {
  return Boolean(event && (event as ConfirmableEvent)[UNSAVED_CHANGES_CONFIRMED]);
}

function shouldIgnoreModifiedClick(event: MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function getClosestAnchor(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
}

/**
 * Protects a dirty form from accidental navigation.
 *
 * Next's App Router does not expose a supported route-blocking API. This hook combines the
 * browser-native `beforeunload` prompt for tab closes, reloads, and document navigations with a
 * capture-phase anchor guard for client-side link clicks.
 */
export function useUnsavedChangesGuard({ enabled, message }: UseUnsavedChangesGuardOptions) {
  const enabledRef = useRef(enabled);
  const messageRef = useRef(message);

  enabledRef.current = enabled;
  messageRef.current = message;

  const confirmIfUnsaved = useCallback((event?: Event) => {
    if (!enabledRef.current || typeof window === 'undefined') return true;
    if (wasUnsavedChangesConfirmed(event)) return true;

    const confirmed = window.confirm(messageRef.current);
    if (confirmed) markUnsavedChangesConfirmed(event);
    return confirmed;
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!enabledRef.current) return;

      event.preventDefault();
      // Browsers intentionally show their own localized text for this prompt, but setting
      // returnValue is still required by older implementations to trigger it.
      event.returnValue = '';
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (!enabledRef.current) return;
      if (event.defaultPrevented || shouldIgnoreModifiedClick(event)) return;

      const anchor = getClosestAnchor(event.target);
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.href === window.location.href) return;

      if (wasUnsavedChangesConfirmed(event)) return;

      if (window.confirm(messageRef.current)) {
        markUnsavedChangesConfirmed(event);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('click', handleDocumentClick, { capture: true });
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('click', handleDocumentClick, { capture: true });
    };
  }, []);

  return confirmIfUnsaved;
}
