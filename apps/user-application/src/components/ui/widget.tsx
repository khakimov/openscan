import { cn } from '@/utils/cn'
import { ReactNode } from 'react'

interface WidgetProps {
  children: ReactNode
  className?: string
}

interface WidgetHeadProps {
  children: ReactNode
  className?: string
}

interface WidgetBodyProps {
  children: ReactNode
  className?: string
}

export function Widget({ children, className }: WidgetProps) {
  return (
    <div className={cn(
      'rounded-lg border border-border bg-card shadow-sm',
      className
    )}>
      {children}
    </div>
  )
}

export function WidgetHead({ children, className }: WidgetHeadProps) {
  return (
    <div className={cn(
      'flex items-center justify-between px-6 py-4 border-b border-border',
      className
    )}>
      {children}
    </div>
  )
}

export function WidgetBody({ children, className }: WidgetBodyProps) {
  return (
    <div className={cn('p-6', className)}>
      {children}
    </div>
  )
}