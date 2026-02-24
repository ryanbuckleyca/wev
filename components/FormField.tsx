import FormLabel from '@/components/FormLabel'
import FormInput from '@/components/FormInput'
import ErrorMessage from '@/components/ErrorMessage'

interface FormFieldProps {
  label: string
  type?: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  fullWidth?: boolean
  htmlFor?: string
}

export default function FormField({ 
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  error,
  fullWidth = false,
  htmlFor
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <FormLabel htmlFor={htmlFor} required={required}>
        {label}
      </FormLabel>
      <FormInput
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        fullWidth={fullWidth}
      />
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  )
}
