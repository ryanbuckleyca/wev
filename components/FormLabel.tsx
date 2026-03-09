interface FormLabelProps {
  children: any
  htmlFor?: string
  required?: boolean
}

export default function FormLabel({ children, htmlFor, required = false }: FormLabelProps) {
  return (
    <label 
      htmlFor={htmlFor}
      className="block text-sm font-semibold text-[var(--foreground)] mb-2"
    >
      {children}
      {required && <span className="text-[var(--destructive-foreground)] ml-1">*</span>}
    </label>
  )
}
