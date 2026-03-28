import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Chevron from '@/components/Chevron';
import { useListbox } from '../useListbox';
import ValueItem from './ValueItem';
import type { WorkValue } from '@/lib/values';

type Row =
  | { kind: 'group'; category: string; count: number; selectedCount: number }
  | { kind: 'item'; value: WorkValue };

interface ValuesListProps {
  values: WorkValue[];
  selectedSet: Set<string>;
  query: string;
  locale: 'en' | 'fr';
  onToggle: (id: string) => void;
  listboxId: string;
  ariaDescribedBy?: string;
}

export default function ValuesList({
  values,
  selectedSet,
  query,
  locale,
  onToggle,
  listboxId,
  ariaDescribedBy,
}: ValuesListProps) {
  const t = useTranslations('profile');

  const allCategories = new Set(values.map((v) => v.category[locale]));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(allCategories));
  const q = query.toLowerCase().trim();
  const filtered = q
    ? values.filter(
        (v) =>
          v.label[locale].toLowerCase().includes(q) || v.summary[locale].toLowerCase().includes(q),
      )
    : values;

  // Auto-expand groups with matches when searching (fix infinite loop)
  useEffect(() => {
    if (!q) return;
    // Find all categories with a match
    const matchedCategories = new Set(
      values
        .filter(
          (v) =>
            v.label[locale].toLowerCase().includes(q) ||
            v.summary[locale].toLowerCase().includes(q),
        )
        .map((v) => v.category[locale]),
    );
    setTimeout(
      () =>
        setCollapsed((prev) => {
          let changed = false;
          const next = new Set(prev);
          matchedCategories.forEach((cat) => {
            if (next.has(cat)) {
              next.delete(cat);
              changed = true;
            }
          });
          return changed ? next : prev;
        }),
      0,
    );
  }, [q, locale, values]);

  const grouped = new Map<string, WorkValue[]>();
  for (const v of filtered) {
    const cat = v.category[locale];
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(v);
  }

  const rows: Row[] = [];
  Array.from(grouped.entries()).forEach(([cat, items]) => {
    rows.push({
      kind: 'group',
      category: cat,
      count: items.length,
      selectedCount: items.filter((v: WorkValue) => selectedSet.has(v.id)).length,
    });
    if (!collapsed.has(cat)) {
      items.forEach((item) => rows.push({ kind: 'item', value: item }));
    }
  });

  const optPrefix = `${listboxId}-opt`;
  const { activeIndex, activeDescendant, setActive, handleKeyDown } = useListbox(
    rows.length,
    optPrefix,
  );

  if (filtered.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-zinc-500">
        {t('valuesNoResults')}
      </p>
    );
  }

  function activate(i: number) {
    const row = rows[i];
    if (row.kind === 'group') {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(row.category)) {
          next.delete(row.category);
        } else {
          next.add(row.category);
        }
        return next;
      });
    } else {
      onToggle(row.value.id);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2">
      <div className="group relative flex min-h-0 flex-1 flex-col rounded-md">
        <div
          id={listboxId}
          role="listbox"
          tabIndex={0}
          aria-label={t('valuesListboxLabel')}
          aria-activedescendant={activeDescendant}
          aria-describedby={ariaDescribedBy}
          onKeyDown={(e) => handleKeyDown(e, activate)}
          className="relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md pb-2 focus:outline-none"
        >
          {rows.map((row, i) => {
            const active = i === activeIndex;
            if (row.kind === 'group') {
              return (
                <div
                  key={`g-${row.category}`}
                  id={`${optPrefix}-${i}`}
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setActive(i);
                    activate(i);
                  }}
                  className={`cursor-pointer px-4 py-3 border-b border-gray-50 dark:border-zinc-800/60 bg-muted dark:bg-zinc-800/60 ${
                    active
                      ? 'group-focus-within:bg-blue-50/60 dark:group-focus-within:bg-blue-900/20 hover:group-focus-within:bg-blue-100/50 dark:hover:group-focus-within:bg-blue-900/30'
                      : 'hover:bg-gray-100/90 dark:hover:bg-zinc-700/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[14px] font-semibold text-gray-900 dark:text-zinc-100 truncate">
                        {row.category}
                      </span>
                      <span className="text-xs font-semibold tabular-nums rounded-full px-2.5 py-0.5 bg-muted text-muted-foreground dark:bg-zinc-800 dark:text-zinc-400">
                        {row.selectedCount}/{row.count}
                      </span>
                    </div>
                    <Chevron
                      rotated={!collapsed.has(row.category)}
                      size={14}
                      className="text-gray-400 dark:text-zinc-500"
                    />
                  </div>
                </div>
              );
            }
            return (
              <ValueItem
                key={row.value.id}
                id={`${optPrefix}-${i}`}
                value={row.value}
                isActive={active}
                isSelected={selectedSet.has(row.value.id)}
                onToggle={() => {
                  setActive(i);
                  activate(i);
                }}
                locale={locale}
              />
            );
          })}
        </div>
        {/* Ring on a layer above scrolling rows — inset box-shadow on the scroller paints under descendants */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] rounded-md opacity-0 ring-2 ring-inset ring-blue-400/70 transition-opacity duration-150 group-focus-within:opacity-100"
        />
      </div>
    </div>
  );
}
