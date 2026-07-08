import { useEffect, useRef, useState, useContext } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/Button';
import Chevron from './Chevron';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { CheckOutlined } from '@lineiconshq/free-icons';
import { BulletinFilterContext } from '@/contexts/BulletinFilterContext';
import type { JobSortOption } from '@/lib/bulletin/job-query';

export type SortOption =
  | 'date-desc'
  | 'date-asc'
  | 'match-desc'
  | 'value-match-desc'
  | 'skill-match-desc'
  | 'salary-desc'
  | 'salary-asc'
  | 'org-asc'
  | 'org-desc';

export interface SortOptionDef {
  value: SortOption | string;
  label: string;
  group?: string;
}

interface SortDropdownProps {
  /** When false, hide the 'Best match' option (requires being logged in) */
  showMatchOption?: boolean;
  /** Override the full list of sort options. */
  options?: SortOptionDef[];
  /** Restrict visible options to this subset (matched by value). */
  optionValues?: SortOption[];
}

/** Controlled mode — caller manages sort state explicitly (e.g. org index). */
interface ControlledProps extends SortDropdownProps {
  sortBy: string;
  onChange: (value: string) => void;
}

/**
 * Context-driven mode — reads from/writes to BulletinFilterContext.
 * Must be rendered inside a BulletinFilterProvider.
 */
interface ContextDrivenProps extends SortDropdownProps {
  sortBy?: never;
  onChange?: never;
}

type Props = ControlledProps | ContextDrivenProps;

/**
 * Sort dropdown.
 *
 * Two usage modes:
 * 1. **Controlled** — pass `sortBy` + `onChange` explicitly (e.g. org index page).
 * 2. **Context-driven** — omit both; reads from/writes to BulletinFilterContext.
 *    Requires this component to be rendered inside a BulletinFilterProvider.
 */
export default function SortDropdown({
  showMatchOption,
  sortBy: propsSortBy,
  onChange: propsOnChange,
  options: propsOptions,
  optionValues,
}: Props) {
  // Context is optional — controlled callers (e.g. org index) pass sortBy+onChange directly.
  // Context-driven callers (e.g. BulletinPageView inside BulletinFilterProvider) omit them.
  const context = useContext(BulletinFilterContext);

  const isControlled = propsSortBy !== undefined || propsOnChange !== undefined;

  if (process.env.NODE_ENV !== 'production' && !isControlled && !context) {
    throw new Error(
      'SortDropdown: must be rendered inside a BulletinFilterProvider when sortBy/onChange are not provided.',
    );
  }

  const sortBy = propsSortBy ?? context?.sortBy ?? '';
  const onChange: (value: string) => void =
    propsOnChange ?? (context ? (v) => void context.setSortBy(v as JobSortOption) : () => {});

  const t = useTranslations();

  const OPTIONS: SortOptionDef[] = propsOptions ?? [
    { value: 'date-desc', label: t('sort.newestFirst'), group: 'date' },
    { value: 'date-asc', label: t('sort.oldestFirst'), group: 'date' },
    { value: 'match-desc', label: t('sort.bestMatch'), group: 'match' },
    { value: 'value-match-desc', label: t('sort.valueMatch'), group: 'match' },
    { value: 'skill-match-desc', label: t('sort.skillMatch'), group: 'match' },
    { value: 'salary-desc', label: t('sort.salaryHighToLow'), group: 'salary' },
    { value: 'salary-asc', label: t('sort.salaryLowToHigh'), group: 'salary' },
    { value: 'org-asc', label: t('sort.orgAZ'), group: 'org' },
    { value: 'org-desc', label: t('sort.orgZA'), group: 'org' },
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

  const valueSet = optionValues ? new Set<string>(optionValues) : null;
  const optionsToShow = OPTIONS.filter((option) => {
    if (valueSet && !valueSet.has(option.value)) return false;
    return showMatchOption !== false || option.group !== 'match';
  });

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
