import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { act } from 'react'

// React 19 is stricter about act() boundaries than React 18. When components
// use async effects with fake timers (e.g. polling), microtask-scheduled state
// updates can land just after an act() boundary closes, triggering a spurious
// warning. This is a known React 19 + Testing Library interop issue.
// See: https://github.com/testing-library/react-testing-library/issues/1297
const originalConsoleError = console.error
console.error = (...args: Parameters<typeof console.error>) => {
  const msg = typeof args[0] === 'string' ? args[0] : ''
  if (msg.includes('was not wrapped in act(')) return
  originalConsoleError(...args)
}

afterEach(async () => {
  await act(async () => {
    cleanup()
  })
})
