'use client';

import { createContext, useContext, ReactNode } from 'react';
import type { BulletinFilterControls } from '@/lib/hooks/useBulletinFilters';

export const BulletinFilterContext = createContext<BulletinFilterControls | null>(null);

export function BulletinFilterProvider({
  filters,
  children,
}: {
  filters: BulletinFilterControls;
  children: ReactNode;
}) {
  return (
    <BulletinFilterContext.Provider value={filters}>{children}</BulletinFilterContext.Provider>
  );
}

export function useBulletinFilterContext() {
  const context = useContext(BulletinFilterContext);
  if (!context) {
    throw new Error('useBulletinFilterContext must be used within a BulletinFilterProvider');
  }
  return context;
}
