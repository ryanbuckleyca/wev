interface StatusIconProps {
  type: 'success' | 'error' | 'warning' | 'info' | 'loading'
  className?: string
}

export default function StatusIcon({ type, className = '' }: StatusIconProps) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓'
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
