import { Label } from '@/components/ui/Label';

interface FormLabelProps {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  as?: 'label' | 'legend';
}

export default function FormLabel({
  children,
  htmlFor,
  required = false,
  as = 'label',
}: FormLabelProps) {
  if (as === 'legend') {
    return (
      <legend className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {children}
        {required && <span className="text-destructive-foreground ml-1">*</span>}
      </legend>
    );
  }

  return (
    <Label htmlFor={htmlFor} className="block">
      {children}
      {required && <span className="text-destructive-foreground ml-1">*</span>}
    </Label>
  );
}
