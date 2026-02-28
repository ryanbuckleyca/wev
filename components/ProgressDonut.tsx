"use client"

interface ProgressDonutProps {
  percentage: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function ProgressDonut({ percentage, size = 'sm', className = '' }: ProgressDonutProps) {
  const normalizedPercentage = Math.min(Math.max(percentage, 0), 100)

  const sizes = {
    sm: { width: 14, height: 14, strokeWidth: 3 },
    md: { width: 18, height: 18, strokeWidth: 4 },
    lg: { width: 20, height: 20, strokeWidth: 5 },
  }

  const config = sizes[size]
  const radius = (config.width - config.strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (normalizedPercentage / 100) * circumference

  const getColor = () => 'var(--success-solid)'

  const getOpacity = () => {
    if (normalizedPercentage === 0) return 0.2
    return 0.3 + (normalizedPercentage / 100) * 0.7
  }

  const strokeColor = getColor()

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={config.width} height={config.height} className="transform -rotate-90">
        <circle
          cx={config.width / 2}
          cy={config.height / 2}
          r={radius}
          stroke="var(--border)"
          strokeWidth={config.strokeWidth}
          fill="none"
          style={{ opacity: 0.5 }}
        />

        <circle
          cx={config.width / 2}
          cy={config.height / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={config.strokeWidth}
          fill="none"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
          style={{ opacity: getOpacity() }}
        />
      </svg>
    </div>
  )
}
