import { Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';

interface SseBadgeProps {
  label: string;
  size?: number;
}

export default function SseBadge({ label, size = 18 }: SseBadgeProps) {
  return (
    <span className="flex-shrink-0" role="img" aria-label={label}>
      <Lineicons icon={Leaf1Solid} size={size} className="text-wev-success" />
    </span>
  );
}
