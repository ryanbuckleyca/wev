'use client'

import React, { ReactNode } from 'react'

interface RoundToggleProps {
  children: ReactNode
  className?: string
}

export default function RoundToggle({ children, className = '' }: RoundToggleProps) {
  const baseClasses = 'flex items-center justify-center border border-wev-border rounded-full overflow-hidden self-stretch min-h-[28px] h-[32px] transition-all duration-500 ease-in-out'
  const combinedClasses = `${baseClasses} ${className}`.trim()

  return <div className={combinedClasses}>{children}</div>
}
