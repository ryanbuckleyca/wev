import { Label } from '@/components/ui/Label';
import { cn } from '@/lib/utils';

interface FormLabelProps {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  as?: 'label' | 'legend';
  className?: string;
}

export default function FormLabel({
  children,
  htmlFor,
  required = false,
  as = 'label',
  className,
}: FormLabelProps) {
  if (as === 'legend') {
    return (
      <legend
        className={cn(
          'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          className,
        )}
      >
        {children}
        {required && <span className="text-destructive-foreground ml-1">*</span>}
      </legend>
    );
  }

  return (
    <Label htmlFor={htmlFor} className={cn('block', className)}>
      {children}
      {required && <span className="text-destructive-foreground ml-1">*</span>}
    </Label>
  );
}
