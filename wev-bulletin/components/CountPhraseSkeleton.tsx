/** Single pulse for loading count phrases (e.g. "2 of 2 organizations"). */
export default function CountPhraseSkeleton({ className = 'w-32' }: { className?: string }) {
  return (
    <span
      className={`inline-block skeleton-pulse rounded-sm h-4 align-middle ${className}`}
      aria-hidden
    />
  );
}
