import { Lineicons } from '@lineiconshq/react-lineicons'
import { CheckOutlined } from '@lineiconshq/free-icons'

interface StatusIconProps {
  type: 'success' | 'error' | 'warning' | 'info' | 'loading'
  className?: string
}

export default function StatusIcon({ type, className = '' }: StatusIconProps) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <Lineicons icon={CheckOutlined} size={16} className={className} />
      case 'error':
        return '✕'
      case 'warning':
        return '⚠'
      case 'info':
        return 'ℹ'
      case 'loading':
        return 'ℹ'
      default:
        return 'ℹ'
    }
  }

  const getClassName = () => {
    if (type === 'success') return '' // Icon handles its own styling
    const baseClass = 'font-bold'
    const sizeClass = 'text-lg'
    return `${baseClass} ${sizeClass} ${className}`.trim()
  }

  return (
    <span className={getClassName()}>
      {getIcon()}
    </span>
  )
}
