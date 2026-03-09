"use client"

interface ProgressDonutProps {
  percentage: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  text?: string
}

export default function ProgressDonut({ percentage, size = 'sm', className = '', text }: ProgressDonutProps) {
  const normalizedPercentage = Math.min(Math.max(percentage, 0), 100)

  const sizes = {
    sm: { width: 14, height: 14 },
    md: { width: 18, height: 18 },
    lg: { width: 20, height: 20 },
    xl: { width: 45, height: 45 },
  }

  const config = sizes[size]

  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      role="img"
      aria-label={`Progress: ${normalizedPercentage}%`}
    >
      <div 
        className="rounded-full relative"
        style={{
          width: config.width,
          height: config.height,
          background: `conic-gradient(from 0deg, var(--primary) 0deg ${normalizedPercentage * 3.6}deg, var(--muted) ${normalizedPercentage * 3.6}deg)`,
          border: 'none'
        }}
      >
        <div 
          className="absolute inset-1 rounded-full bg-card flex items-center justify-center"
        >
          {text && (
            <span 
              className="font-bold" 
              style={{ 
                fontSize: config.width / 4,
                color: 'var(--primary)'
              }}
            >
              {text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
