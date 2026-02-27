import LoadingIndicator from './LoadingIndicator'

interface LoadingStateProps {
  message?: string
  fullScreen?: boolean
}

export default function LoadingState({ message = 'Loading...', fullScreen = true }: LoadingStateProps) {
  return <LoadingIndicator message={message} fullScreen={fullScreen} />
}
