import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

interface CardLayoutProps {
  children: React.ReactNode
  className?: string
}

export default function CardLayout({ children, className }: CardLayoutProps) {
  return (
    <Card className={cn('p-6', className)}>
      {children}
    </Card>
  )
}
