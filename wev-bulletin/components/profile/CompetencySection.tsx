import CountBadge from '@/components/CountBadge';
import Alert from '@/components/ui/Alert';

interface CompetencySectionProps {
  label: string;
  count: number;
  max: number;
  overLimitWarning: string;
  children: React.ReactNode;
}

/**
 * Shared wrapper for Skills and Work Values subsections on the profile page.
 * Renders an uppercase sub-label with a count badge, an optional over-limit
 * warning, and the selector content.
 */
export default function CompetencySection({
  label,
  count,
  max,
  overLimitWarning,
  children,
}: CompetencySectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <CountBadge count={count} max={max} />
      </div>

      {count > max && <Alert variant="warning">{overLimitWarning}</Alert>}

      {children}
    </div>
  );
}
