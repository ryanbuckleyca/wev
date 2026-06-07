'use client';

import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { zIndex } from '@/lib/design-tokens';

export interface SelectionBrowseModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  dialogAriaLabel: string;
  backAriaLabel: string;
  doneLabel: string;
  selectedCount: number;
  headerCenter: ReactNode;
  selectedPills?: ReactNode;
  children: ReactNode;
}

export default function SelectionBrowseModal({
  isOpen,
  onClose,
  searchInputRef,
  dialogAriaLabel,
  backAriaLabel,
  doneLabel,
  selectedCount,
  headerCenter,
  selectedPills,
  children,
}: SelectionBrowseModalProps) {
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 600 : (window.visualViewport?.height ?? window.innerHeight),
  );

  // Track visual viewport for mobile virtual keyboard
  useEffect(() => {
    if (!isOpen || !isMobile) return;
    const update = () => setViewportHeight(window.visualViewport?.height ?? window.innerHeight);
    update();
    const vp = window.visualViewport;
    if (vp) {
      vp.addEventListener('resize', update);
      vp.addEventListener('scroll', update);
      return () => {
        vp.removeEventListener('resize', update);
        vp.removeEventListener('scroll', update);
      };
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isOpen, isMobile]);

  const inner = (
    <>
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-3 bg-card dark:border-zinc-800 shrink-0">
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            className="shrink-0 text-gray-600 dark:text-gray-400"
            aria-label={backAriaLabel}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </DialogPrimitive.Close>
        <div className="flex-1 min-w-0">{headerCenter}</div>
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            className="shrink-0 flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"
            style={{ color: 'var(--info-solid)' }}
          >
            {doneLabel}
            {selectedCount > 0 && (
              <span
                className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                style={{ backgroundColor: 'var(--info-solid)' }}
              >
                {selectedCount}
              </span>
            )}
          </button>
        </DialogPrimitive.Close>
      </div>
      {selectedPills}
      {/* Scroll lives inside children (e.g. listbox) so focus ring matches the visible viewport.
          pb-2 insets results + ring from the modal card bottom. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-2">{children}</div>
    </>
  );

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 bg-black/40 backdrop-blur-sm hidden md:block"
          style={{ zIndex: zIndex.modalOverlay }}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => searchInputRef?.current?.focus({ preventScroll: true }), 50);
          }}
          className={
            isMobile
              ? 'fixed inset-0 flex flex-col overflow-hidden bg-card outline-none'
              : 'fixed inset-0 flex items-center justify-center p-4 pointer-events-none outline-none'
          }
          style={isMobile ? { zIndex: zIndex.modal, height: `${viewportHeight}px` } : { zIndex: zIndex.modal }}
        >
          <DialogPrimitive.Title className="sr-only">{dialogAriaLabel}</DialogPrimitive.Title>
          {isMobile ? (
            inner
          ) : (
            <div
              className="flex w-full max-w-[600px] flex-col overflow-hidden bg-card rounded-2xl border border-gray-200 shadow-2xl dark:border-zinc-800 pointer-events-auto"
              style={{
                height: 'min(800px, calc(100dvh - 2rem))',
                maxHeight: 'min(800px, calc(100dvh - 2rem))',
              }}
            >
              {inner}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
