interface LoadingStateProps {
  message?: string
  fullScreen?: boolean
}

export default function LoadingState({ message = 'Loading...', fullScreen = true }: LoadingStateProps) {
  const containerClasses = fullScreen 
    ? 'min-h-screen bg-[var(--bg)] flex items-center justify-center'
    : 'flex items-center justify-center py-8'

  return (
    <div className={containerClasses}>
      <p className="text-[var(--text-secondary)]">{message}</p>
    </div>
  )
}
