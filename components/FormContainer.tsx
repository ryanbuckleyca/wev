interface FormContainerProps {
  children: any
  onSubmit?: (e: React.FormEvent) => void
  className?: string
}

export default function FormContainer({ children, onSubmit, className = '' }: FormContainerProps) {
  return (
    <form onSubmit={onSubmit} className={`flex flex-col space-y-6 ${className}`.trim()}>
      {children}
    </form>
  )
}
