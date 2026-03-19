import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-2 text-[13px] font-medium text-gray-900 shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-100/50 disabled:cursor-not-allowed disabled:opacity-50',
          'dark:bg-zinc-900/50 dark:border-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-800/50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
