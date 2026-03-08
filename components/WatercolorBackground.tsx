interface WatercolorBackgroundProps {
  className?: string
  style?: React.CSSProperties
  blur?: string
  opacity?: number
  height?: string | number
  useGradients?: boolean
}

export default function WatercolorBackground({ 
  className = "", 
  style = {},
  blur = "90px",
  opacity = 1.0,
  height = "50vh",
  useGradients = false
}: WatercolorBackgroundProps) {
  return (
    <>
      {/* Gradient styles - available for future use */}
      {useGradients && (
        <style jsx>{`
          .svg-bg { fill: var(--gradient-bg); transition: fill 0.5s ease; }
          .s-lp   { stop-color: var(--gradient-lp); transition: stop-color 0.5s ease; }
          .s-tl   { stop-color: var(--gradient-tl); transition: stop-color 0.5s ease; }
          .s-mb   { stop-color: var(--gradient-mb); transition: stop-color 0.5s ease; }
        `}</style>
      )}
      
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
          style={{ opacity: 'var(--lavender-opacity, 0.04)' }}
        />
        <circle 
          cx="930" 
          cy="190" 
          r="510" 
          fill="var(--watercolor-blue)" 
          style={{ opacity: 'var(--blue-opacity, 0.2)' }}
        />
      </svg>
    </>
  )
}
