import { cn } from '@/utils/cn'
import { ReactNode } from 'react'

interface PaddingProps {
  children: ReactNode
  className?: string
}

export function Padding({ children, className }: PaddingProps) {
  return (
    <div className={cn('p-4 lg:p-8', className)}>
      {children}
    </div>
  )
}