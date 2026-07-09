'use client';

import Link from 'next/link';
import { Leaf1Solid } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';

interface SseToggleLinkProps {
  href: string;
  isActive: boolean;
  label: string;
}

export default function SseToggleLink({ href, isActive, label }: SseToggleLinkProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'true' : undefined}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors whitespace-nowrap ${
        isActive
          ? 'bg-wev-success/10 border-wev-success text-wev-success hover:bg-wev-success/20'
          : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
      }`}
    >
      <Lineicons
        icon={Leaf1Solid}
        size={14}
        className={isActive ? 'text-wev-success' : 'text-muted-foreground'}
        aria-hidden
      />
      {label}
    </Link>
  );
}
