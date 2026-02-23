interface FormInputProps {
  type: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
}

export default function FormInput({ 
  type, 
  value, 
  onChange, 
  placeholder, 
  required = false, 
  disabled = false 
}: FormInputProps) {
  return (
    <input
      type={type}
      required={required}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded px-3 py-2 text-sm outline-none"
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    />
  )
}
