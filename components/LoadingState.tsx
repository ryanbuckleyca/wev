import AppLoader from './AppLoader'

interface LoadingStateProps {
  message?: string
  fullScreen?: boolean
}

export default function LoadingState({ message = 'Loading...', fullScreen = true }: LoadingStateProps) {
  return <AppLoader message={message} fullScreen={fullScreen} />
}
