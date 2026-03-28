import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/Button';
import Chevron from './Chevron';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { CheckOutlined } from '@lineiconshq/free-icons';

type SortOption =
  | 'date-desc'
  | 'date-asc'
  | 'match-desc'
  | 'value-match-desc'
  | 'skill-match-desc'
  | 'salary-desc'
  | 'salary-asc'
  | 'org-asc';

interface SortDropdownProps {
  sortBy: SortOption;
  onChange: (s: SortOption) => void;
  /** When false, hide the 'Best match' option (requires being logged in) */
  showMatchOption?: boolean;
}

export default function SortDropdown({ sortBy, onChange, showMatchOption }: SortDropdownProps) {
  const t = useTranslations();

  const OPTIONS: { value: SortOption; label: string; group?: string }[] = [
    { value: 'date-desc', label: t('sort.newestFirst'), group: 'date' },
    { value: 'date-asc', label: t('sort.oldestFirst'), group: 'date' },
    { value: 'match-desc', label: t('sort.bestMatch'), group: 'match' },
    { value: 'value-match-desc', label: t('sort.valueMatch'), group: 'match' },
    { value: 'skill-match-desc', label: t('sort.skillMatch'), group: 'match' },
    { value: 'salary-desc', label: t('sort.salaryHighToLow'), group: 'salary' },
    { value: 'salary-asc', label: t('sort.salaryLowToHigh'), group: 'salary' },
    { value: 'org-asc', label: t('sort.orgAZ'), group: 'org' },
  ];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const label = OPTIONS.find((o) => o.value === sortBy)?.label ?? t('sort.newestFirst');
  const optionsToShow =
    showMatchOption === false ? OPTIONS.filter((o) => !o.group || o.group !== 'match') : OPTIONS;

  return (
    <div ref={rootRef} className="sort-dropdown relative z-50">
      <Button
        onClick={() => setOpen(!open)}
        variant="outline"
        size="sm"
        className="flex-center-gap bg-transparent border-none text-muted-foreground p-1.5 text-xs"
      >
        <span>{t('sort.label')} </span>
        <span className="font-semibold text-foreground">{label}</span>
        <Chevron rotated={open} />
      </Button>

      <div
        role="menu"
        aria-hidden={!open}
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          minWidth: '160px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '4px',
          opacity: open ? '1' : '0',
          transform: open ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.97)',
          transformOrigin: 'top right',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
          pointerEvents: open ? 'auto' : 'none',
          boxShadow: 'var(--tw-shadow-wev-dropdown)',
        }}
      >
        {optionsToShow.map((opt) => (
          <div
            key={opt.value}
            className="px-3 py-2 rounded-md cursor-pointer transition-colors text-xs p-2 rounded-lg"
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
          >
            <span
              className={
                sortBy === opt.value ? 'text-primary font-semibold' : 'text-foreground font-normal'
              }
            >
              {opt.label}
            </span>
            {sortBy === opt.value && (
              <Lineicons icon={CheckOutlined} size={12} className="float-right text-primary" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
