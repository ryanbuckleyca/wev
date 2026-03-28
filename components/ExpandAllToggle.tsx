import { useTranslations } from 'next-intl';
import Button from '@/components/Button';
import Chevron from './Chevron';

interface ExpandAllToggleProps {
  allExpanded: boolean;
  onToggle: () => void;
}

export default function ExpandAllToggle({ allExpanded, onToggle }: ExpandAllToggleProps) {
  const t = useTranslations();
  return (
    <Button
      onClick={onToggle}
      variant="outline"
      size="sm"
      className="flex-center-gap bg-transparent border-none text-muted-foreground p-1.5 text-xs"
    >
      <Chevron rotated={allExpanded} />
      <span>{allExpanded ? t('expand.collapseAll') : t('expand.expandAll')}</span>
    </Button>
  );
}
