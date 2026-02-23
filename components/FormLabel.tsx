interface FormLabelProps {
  children: any
  htmlFor?: string
  required?: boolean
}

export default function FormLabel({ children, htmlFor, required = false }: FormLabelProps) {
  return (
    <label 
      htmlFor={htmlFor}
      className="block text-sm font-semibold text-[var(--text-primary)] mb-2"
    >
      {children}
      {required && <span className="text-[var(--alert-text)] ml-1">*</span>}
    </label>
  )
}
