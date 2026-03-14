import { Lineicons } from '@lineiconshq/react-lineicons'
import { ChevronDownOutlined } from '@lineiconshq/free-icons'

interface ChevronProps {
  size?: number
  rotated?: boolean
  className?: string
  style?: React.CSSProperties
}

export default function Chevron({ size = 12, rotated = false, className = '', style = {} }: ChevronProps) {
  const transform = rotated ? 'rotate(180deg)' : 'rotate(0deg)'

  return (
    <Lineicons
      icon={ChevronDownOutlined}
      size={size}
      className={className}
      style={{ transition: 'transform 0.2s ease', transform, ...style }}
      aria-hidden
    />
  )
}
