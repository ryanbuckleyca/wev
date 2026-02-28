import Button from '@/components/Button'

interface ExpandAllToggleProps {
  allExpanded: boolean
  onToggle: () => void
}

export default function ExpandAllToggle({ allExpanded, onToggle }: ExpandAllToggleProps) {
  return (
    <Button
      onClick={onToggle}
      variant="outline"
      size="sm"
      className="flex items-center gap-1"
      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '5px 8px', fontSize: '13px' }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        style={{ transition: 'transform 0.2s ease', transform: allExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
      >
        <polyline points="3 5 6 8 9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{allExpanded ? 'Collapse all' : 'Expand all'}</span>
    </Button>
  )
}
