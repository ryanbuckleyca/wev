import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

interface FormInputProps {
  type: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  fullWidth?: boolean
}

export default function FormInput({
  type,
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  fullWidth = false,
}: FormInputProps) {
  return (
    <Input
      type={type}
      required={required}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(!fullWidth && 'w-auto')}
    />
  )
}
