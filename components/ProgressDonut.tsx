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
    sm: { width: 14, height: 14, border: 0.5 },
    md: { width: 18, height: 18, border: 2 },
    lg: { width: 20, height: 20, border: 2 },
    xl: { width: 45, height: 45, border: 2 },
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
          background: `conic-gradient(from 0deg, #5B8C8A 0deg ${normalizedPercentage * 3.6}deg, #f9fafb ${normalizedPercentage * 3.6}deg)`,
          border: `${config.border}px solid #5B8C8A`
        }}
      >
        <div 
          className="absolute inset-1 rounded-full bg-white flex items-center justify-center"
        >
          {text && (
            <span 
              className="font-bold" 
              style={{ 
                fontSize: config.width / 4,
                color: 'rgb(var(--primary))'
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
