interface ErrorMessageProps {
  children: React.ReactNode;
  className?: string;
}

export default function ErrorMessage({ children, className = '' }: ErrorMessageProps) {
  return (
    <p className={`text-[var(--destructive-foreground)] text-sm mt-2 ${className}`.trim()}>
      {children}
    </p>
  );
}
