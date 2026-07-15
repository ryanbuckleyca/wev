/**
 * Text-shaped loading placeholder: reserves space with an invisible string in
 * the current font/size/weight, then paints a pulse over it. Avoids layout
 * shift when the real value swaps in.
 */
export default function TextSkeleton({
  placeholder,
  className = '',
}: {
  /** Invisible string that should roughly match the eventual value's width. */
  placeholder: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-block ${className}`.trim()} aria-hidden>
      <span className="invisible whitespace-pre">{placeholder}</span>
      <span className="absolute inset-x-0 top-[0.2em] bottom-[0.15em] skeleton-pulse rounded-sm" />
    </span>
  );
}
