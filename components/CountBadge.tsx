interface CountBadgeProps {
  count: number;
  max: number;
}

export default function CountBadge({ count, max }: CountBadgeProps) {
  const isOver = count > max;
  return (
    <span
      className={`text-xs font-semibold tabular-nums rounded-full px-3 py-1 transition-colors ${
        isOver
          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
          : 'bg-muted text-muted-foreground dark:bg-zinc-800 dark:text-zinc-400'
      }`}
      aria-label={`${count}/${max}`}
    >
      {count}/{max}
    </span>
  );
}
