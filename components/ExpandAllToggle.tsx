import Button from '@/components/Button'
import Chevron from './Chevron'

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
      <Chevron rotated={allExpanded} />
      <span>{allExpanded ? 'Collapse all' : 'Expand all'}</span>
    </Button>
  )
}
