import StatusIcon from './StatusIcon'

interface BannerMessageProps {
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  className?: string
}

export default function BannerMessage({ type, message, className = '' }: BannerMessageProps) {
  const getBaseClasses = () => {
    // Use the exact same CSS classes as ToastMessage
    const base = 'design-toast'
    const typeClasses = {
      success: 'design-toast-success',
      error: 'design-toast-alert',
      warning: 'design-toast-warning',
      info: 'design-toast-info'
    }
    return `${base} ${typeClasses[type]} ${className}`.trim()
  }

  const getIconColor = () => {
    const colors = {
      success: 'text-[#4a7c48]',
      error: 'text-[#dc2626]',
      warning: 'text-[#C4941A]',
      info: 'text-[#1e40af]'
    }
    return colors[type]
  }

  const getTextColor = () => {
    const colors = {
      success: 'text-[#4a7c48]',
      error: 'text-[#dc2626]',
      warning: 'text-[#C4941A]',
      info: 'text-[#1e40af]'
    }
    return colors[type]
  }

  return (
    <div className={getBaseClasses()}>
      <span className={`font-bold ${getIconColor()}`}>
        <StatusIcon type={type} />
      </span>
      <span> {message}</span>
    </div>
  )
}
