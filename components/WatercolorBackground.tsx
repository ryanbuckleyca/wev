interface WatercolorBackgroundProps {
  className?: string
  style?: React.CSSProperties
  blur?: string
  opacity?: number
  height?: string | number
}

export default function WatercolorBackground({ 
  className = "", 
  style = {},
  blur = "90px",
  opacity = 1.0,
  height = "50vh"
}: WatercolorBackgroundProps) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 800 600" 
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: height,
        zIndex: 0,
        opacity: opacity,
        filter: `blur(${blur})`,
        ...style
      }}
    >
      <circle 
        cx="100" 
        cy="-50" 
        r="580" 
        fill="var(--watercolor-lavender)" 
        style={{ opacity: 'var(--lavender-opacity, 0.24)' }}
      />
      <circle 
        cx="930" 
        cy="190" 
        r="510" 
        fill="var(--watercolor-blue)" 
        style={{ opacity: 'var(--blue-opacity, 0.2)' }}
      />
    </svg>
  )
}
