import { useEffect, useRef, useState } from 'react'
import Button from '@/components/Button'
import Chevron from './Chevron'

type SortOption = 'date-desc' | 'date-asc' | 'match-desc' | 'salary-desc' | 'salary-asc' | 'org-asc'

interface SortDropdownProps {
  sortBy: SortOption
  onChange: (s: SortOption) => void
}

const OPTIONS: { value: SortOption; label: string; group?: string }[] = [
  { value: 'date-desc', label: 'Newest first', group: 'date' },
  { value: 'date-asc', label: 'Oldest first', group: 'date' },
  { value: 'match-desc', label: 'Best match', group: 'match' },
  { value: 'salary-desc', label: 'Salary: high to low', group: 'salary' },
  { value: 'salary-asc', label: 'Salary: low to high', group: 'salary' },
  { value: 'org-asc', label: 'Organization A–Z', group: 'org' },
]

export default function SortDropdown({ sortBy, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!(e.target instanceof Node)) return
      if (!rootRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  const label = OPTIONS.find((o) => o.value === sortBy)?.label ?? 'Newest first'

  return (
    <div ref={rootRef} className="sort-dropdown relative" style={{ zIndex: 50 }}>
      <Button
        onClick={() => setOpen(!open)}
        variant="outline"
        size="sm"
        className="flex items-center gap-1"
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '5px 8px', fontSize: '13px' }}
      >
        <span>Sort: </span>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{label}</span>
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
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '4px',
          opacity: open ? '1' : '0',
          transform: open ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.97)',
          transformOrigin: 'top right',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
          pointerEvents: open ? 'auto' : 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        {OPTIONS.map((opt, idx) => (
          <div
            key={opt.value}
            className="px-3 py-2 rounded-md cursor-pointer transition-colors"
            style={{ fontSize: '13.5px', padding: '8px 12px', borderRadius: '7px' }}
            onClick={() => {
              onChange(opt.value)
              setOpen(false)
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'none'
            }}
          >
            <span style={{ color: sortBy === opt.value ? 'var(--primary)' : 'inherit', fontWeight: sortBy === opt.value ? 600 : 400 }}>
              {opt.label}
            </span>
            {sortBy === opt.value && (
              <svg width="12" height="12" viewBox="0 0 12 12" className="float-right" style={{ opacity: 1 }}>
                <polyline points="2 6 5 9 10 4" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
