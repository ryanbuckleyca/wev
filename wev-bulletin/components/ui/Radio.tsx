'use client';

import * as React from 'react';

const Radio = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return <input type="radio" className={`wev-radio ${className}`} ref={ref} {...props} />;
  },
);

Radio.displayName = 'Radio';

export { Radio };
