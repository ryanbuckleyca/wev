interface LoadingIndicatorProps {
  message?: string | null;
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LoadingIndicator({
  message = 'Loading...',
  fullScreen = true,
  size = 'md',
  className = '',
}: LoadingIndicatorProps) {
  const containerClasses = fullScreen
    ? 'min-h-screen bg-[var(--background)] flex flex-col items-center justify-center gap-3'
    : 'flex flex-col items-center justify-center gap-3 py-8';

  const spinnerSizeClasses =
    size === 'sm'
      ? 'h-4 w-4 border-2'
      : size === 'lg'
        ? 'h-12 w-12 border-[3px]'
        : 'h-8 w-8 border-2';

  return (
    <div className={`${containerClasses} ${className}`.trim()}>
      <div
        className={`animate-spin rounded-full border-border border-t-primary ${spinnerSizeClasses}`}
        aria-hidden
      />
      {message ? <p className="text-[var(--muted-foreground)] text-sm">{message}</p> : null}
    </div>
  );
}
