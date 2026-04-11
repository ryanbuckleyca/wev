interface HeadingProps {
  level: 1 | 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
}

export default function Heading({ level, children, className = '' }: HeadingProps) {
  const baseClasses = {
    1: 'design-type-h1',
    2: 'design-type-h2',
    3: 'design-type-h3',
    4: 'design-type-h4',
  };

  const combinedClasses = `${baseClasses[level]} ${className}`.trim();

  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';

  return <Tag className={combinedClasses}>{children}</Tag>;
}
