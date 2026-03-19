'use client'

import * as React from 'react'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  indeterminate?: boolean
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', indeterminate, ...props }, ref) => {
    const defaultRef = React.useRef<HTMLInputElement>(null)
    const resolvedRef = (ref as React.MutableRefObject<HTMLInputElement>) || defaultRef

    React.useEffect(() => {
      if (resolvedRef.current) {
        resolvedRef.current.indeterminate = !!indeterminate
      }
    }, [resolvedRef, indeterminate])

    return (
      <input
        type="checkbox"
        className={`wev-checkbox ${className}`}
        ref={resolvedRef}
        {...props}
      />
    )
  }
)

Checkbox.displayName = 'Checkbox'

export { Checkbox }
