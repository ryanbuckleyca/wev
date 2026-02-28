'use client'

interface MatchDonutProps {
  percentage: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function MatchDonut({ percentage, size = 'sm', className = '' }: MatchDonutProps) {
  // Ensure percentage is between 0-100
  const normalizedPercentage = Math.min(Math.max(percentage, 0), 100)
  
  // Size configurations
  const sizes = {
    sm: {
      width: 14,  // 16px → 14px (smaller)
      height: 14,
      strokeWidth: 3  // Keep 3px for good proportion
    },
    md: {
      width: 18,  // 20px → 18px (smaller)
      height: 18,
      strokeWidth: 4  // Keep 4px for good proportion
    },
    lg: {
      width: 20,  // 22px → 20px (smaller)
      height: 20,
      strokeWidth: 5  // Keep 5px for good proportion
    }
  }
  
  const config = sizes[size]
  const radius = (config.width - config.strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (normalizedPercentage / 100) * circumference
  
  // Color based on match percentage - transparency-based with success green
  const getColor = () => {
    return 'var(--success-solid)'  // Back to vibrant green
  }
  
  const getOpacity = () => {
    if (normalizedPercentage === 0) return 0.2  // Minimal opacity for 0%
    return 0.3 + (normalizedPercentage / 100) * 0.7  // Scale from 30% to 100% opacity
  }
  
  const strokeColor = getColor()
  
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={config.width}
        height={config.height}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={config.width / 2}
          cy={config.height / 2}
          r={radius}
          stroke="var(--border)"
          strokeWidth={config.strokeWidth}
          fill="none"
          style={{ opacity: 0.5 }}
        />
        
        {/* Progress circle */}
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
