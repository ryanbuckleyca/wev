interface ChevronProps {
  size?: number
  rotated?: boolean
  className?: string
  style?: React.CSSProperties
}

export default function Chevron({ size = 12, rotated = false, className = '', style = {} }: ChevronProps) {
  const transform = rotated ? 'rotate(180deg)' : 'rotate(0deg)'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      className={className}
      style={{ transition: 'transform 0.2s ease', transform, ...style }}
      aria-hidden
    >
      <polyline points="3 5 6 8 9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
