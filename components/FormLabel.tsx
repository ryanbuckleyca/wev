import { Label } from '@/components/ui/Label';

interface FormLabelProps {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
}

export default function FormLabel({ children, htmlFor, required = false }: FormLabelProps) {
  return (
    <Label htmlFor={htmlFor} className="block mb-2">
      {children}
      {required && <span className="text-destructive-foreground ml-1">*</span>}
    </Label>
  );
}
