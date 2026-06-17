'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useTranslations } from 'next-intl';
import {
  markUnsavedChangesConfirmed,
  useUnsavedChangesGuard,
  wasUnsavedChangesConfirmed,
} from '@/lib/hooks/useUnsavedChangesGuard';

type UnsavedChangesContextValue = {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: Dispatch<SetStateAction<boolean>>;
  markUnsavedChanges: () => void;
  confirmIfUnsaved: (event?: Event) => boolean;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
  markUnsavedChanges: () => {},
  confirmIfUnsaved: () => true,
});

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const [hasUnsavedChanges, setHasUnsavedChangesState] = useState(false);
  const hasUnsavedChangesRef = useRef(false);
  const message = t('profile.unsavedChangesPrompt');
  const guardConfirmIfUnsaved = useUnsavedChangesGuard({
    enabled: hasUnsavedChanges,
    message,
  });

  const setHasUnsavedChanges = useCallback<Dispatch<SetStateAction<boolean>>>((next) => {
    const resolved = typeof next === 'function' ? next(hasUnsavedChangesRef.current) : next;
    hasUnsavedChangesRef.current = resolved;
    setHasUnsavedChangesState(resolved);
  }, []);

  const markUnsavedChanges = useCallback(() => {
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChangesState(true);
  }, []);

  const confirmIfUnsaved = useCallback(
    (event?: Event) => {
      if (!hasUnsavedChangesRef.current || typeof window === 'undefined') return true;
      if (wasUnsavedChangesConfirmed(event)) return true;

      const confirmed = window.confirm(message);
      if (confirmed) markUnsavedChangesConfirmed(event);
      return confirmed;
    },
    [message],
  );


  const value = useMemo(
    () => ({ hasUnsavedChanges, setHasUnsavedChanges, markUnsavedChanges, confirmIfUnsaved }),
    [hasUnsavedChanges, setHasUnsavedChanges, markUnsavedChanges, confirmIfUnsaved],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}
