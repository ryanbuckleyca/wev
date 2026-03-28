interface FormContainerProps {
  children: React.ReactNode
  onSubmit?: (e: React.FormEvent) => void
  className?: string
}

export default function FormContainer({ children, onSubmit, className = '' }: FormContainerProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit?.(e)
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col space-y-6 ${className}`.trim()}>
      {children}
    </form>
  )
}
