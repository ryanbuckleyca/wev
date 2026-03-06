'use client'

interface FilterIconProps {
  className?: string
  reversed?: boolean
  ariaHidden?: boolean
}

export default function FilterIcon({ className = '', reversed = false, ariaHidden = false }: FilterIconProps) {
  return (
    <svg 
      className={`${className} ${reversed ? 'rotate-180' : ''}`} 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24" 
      strokeWidth={2.5} 
      aria-hidden={ariaHidden}
    >
      <line x1="4" y1="6" x2="20" y2="6"></line>
      <line x1="8" y1="12" x2="16" y2="12"></line>
      <line x1="11" y1="18" x2="13" y2="18"></line>
    </svg>
  )
}
