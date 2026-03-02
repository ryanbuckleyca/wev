# Testing Guide — wev-bulletin

## Stack

| Tool | Purpose |
|---|---|
| [Vitest](https://vitest.dev/) | Fast, ESM-native test runner (Jest-compatible) |
| [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro) | Render & query React components by user-visible behaviour |
| [@testing-library/user-event](https://testing-library.com/docs/user-event/intro) | Simulate realistic user interactions (clicks, typing, etc.) |
| [@testing-library/jest-dom](https://testing-library.com/docs/ecosystem-jest-dom) | DOM matchers like `toBeVisible()`, `toBeDisabled()` |

## Guiding Principles

These principles come directly from the Testing Library philosophy:

> "If it relates to rendering components, then it should deal with DOM nodes rather than component instances, and it should not encourage dealing with component instances."

> "It should be generally useful for testing the application components in the way the user would use it."

> "Utility implementations and APIs should be simple and flexible."

### 1. Test User Behaviour, Not Implementation Details

Focus on **what the component renders** and **how it behaves**, not how it achieves that behaviour internally.

```tsx
// ❌ Bad — testing internal state / implementation
expect(component.state.isOpen).toBe(true)

// ✅ Good — testing what the user sees
expect(screen.getByRole('dialog')).toBeVisible()
```

Avoid accessing component internals, refs, or state directly. Interact with the component through the DOM, just as a user would.

### 2. Use the `screen` Object

Always use the `screen` object from `@testing-library/react` for queries. This reduces boilerplate and makes tests easier to read.

```tsx
// ❌ Avoid destructuring render
const { getByText } = render(<MyComponent />)

// ✅ Prefer screen
render(<MyComponent />)
expect(screen.getByText('Hello')).toBeVisible()
```

### 3. Prefer Accessible Queries

Choose queries that reflect how users (and assistive technology) find elements. The recommended priority:

| Priority | Query | When to use |
|---|---|---|
| 1st | `getByRole` | Buttons, links, headings, form controls |
| 2nd | `getByLabelText` | Form fields with labels |
| 3rd | `getByPlaceholderText` | Inputs with placeholder text |
| 4th | `getByText` | Non-interactive text content |
| 5th | `getByTestId` | Last resort only |

```tsx
// ❌ Fragile — tied to test IDs or CSS classes
screen.getByTestId('submit-btn')

// ✅ Accessible — matches how users find the button
screen.getByRole('button', { name: 'Submit' })
```

### 4. Use `toBeVisible()` Over `toBeInTheDocument()`

Elements can exist in the DOM but be hidden (`display: none`, `visibility: hidden`, etc.). Prefer `toBeVisible()` for positive assertions to verify the user can actually see the element.

```tsx
// ❌ Only checks DOM presence — element could be hidden
expect(screen.getByText('Success')).toBeInTheDocument()

// ✅ Confirms the element is visible to the user
expect(screen.getByText('Success')).toBeVisible()
```

Use `not.toBeInTheDocument()` when asserting an element is **completely absent** from the DOM (e.g. conditionally rendered content).

### 5. Use `userEvent` Over `fireEvent`

`userEvent` simulates full user interaction sequences (focus, keydown, keyup, input, click) rather than dispatching a single synthetic event. This catches more real-world bugs.

```tsx
// ❌ fireEvent dispatches a single event — incomplete simulation
fireEvent.click(button)

// ✅ userEvent simulates the full interaction
const user = userEvent.setup()
await user.click(button)
```

Always call `userEvent.setup()` at the top of each test that uses it.

### 6. Favour Integration Over Isolation

Prefer tests that assess how components work together over isolated unit tests. This provides a more accurate representation of real-world usage. Only mock what you **must** (network requests, environment-specific APIs).

### 7. Minimize Mocking

Use real modules and dependencies where possible to ensure tests are meaningful and reliable. When mocking is unavoidable:

- Mock at the **boundary** (network, database, browser APIs), not inside your own code.
- Prefer lightweight stubs over complex mock implementations.
- If you find yourself mocking extensively, it may indicate the test scope is wrong.

```tsx
// ❌ Over-mocking — mocking your own utility
vi.mock('./calculateMatch', () => ({ calculateMatch: vi.fn() }))

// ✅ Better — use the real function, mock only the external boundary
vi.mock('@/lib/supabase/client')
```

### 8. Avoid Shared Mutable Variables

Each test should be fully isolated. Don't share mutable state (`let` variables, mock instances) between tests — it couples them and makes failures hard to trace. Define everything a test needs **inside the `it()` block**.

```tsx
// ❌ Bad — shared mutable variable across tests
describe('MyComponent', () => {
  let handler: ReturnType<typeof vi.fn>
  beforeEach(() => {
    handler = vi.fn()
  })

  it('calls handler on click', async () => {
    const user = userEvent.setup()
    render(<MyComponent onClick={handler} />)
    await user.click(screen.getByRole('button'))
    expect(handler).toHaveBeenCalled()
  })
})

// ✅ Good — each test creates its own state
describe('MyComponent', () => {
  it('calls handler on click', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<MyComponent onClick={handleClick} />)
    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledOnce()
  })
})
```

**Exception:** Immutable shared config (like a `defaultProps` object with plain values) is fine in the top scope as a convenience, since it cannot be mutated between tests.

```tsx
// ✅ Fine — immutable defaults with no mock state
const defaultProps = {
  currentPage: 1,
  totalPages: 5,
  onPageChange: () => {},
  totalItems: 50,
  itemsPerPage: 10,
}
```

### 9. Only Use `vi.fn()` for Functions You Assert On

`vi.fn()` creates a tracked mock. Only use it when you plan to assert on it (`toHaveBeenCalled`, `toHaveBeenCalledWith`, etc.). For callbacks you don't assert on, use a plain no-op function instead.

```tsx
// ❌ Bad — vi.fn() used but never asserted on
render(<Pagination onPageChange={vi.fn()} />)
// test only checks DOM text, never checks onPageChange

// ✅ Good — plain no-op for non-asserted callbacks
render(<Pagination onPageChange={() => {}} />)

// ✅ Good — vi.fn() used AND asserted on
const handleChange = vi.fn()
render(<Pagination onPageChange={handleChange} />)
await user.click(screen.getByRole('button', { name: 'Next' }))
expect(handleChange).toHaveBeenCalledWith(2)
```

### 10. Keep Helpers and Constants in the Top Scope

Shared helper functions and immutable constants belong at the **top of the file** (outside `describe`), not nested inside it. This visually separates setup from test logic.

Sub-describe blocks may define their own helpers. Single-use helpers belong inside their `it()` block.

```tsx
// ✅ Preferred — helpers at top scope
import { render, screen } from '@testing-library/react'
import MyComponent from './MyComponent'

const defaultProps = { title: 'Hello', count: 5 }

function renderWithProps(overrides = {}) {
  return render(<MyComponent {...defaultProps} {...overrides} />)
}

describe('MyComponent', () => {
  it('renders the title', () => {
    renderWithProps()
    expect(screen.getByText('Hello')).toBeVisible()
  })
})
```

## File Structure

Test files live **next to the files they test**, not in separate `__tests__` directories:

```
components/
  Button.tsx
  Button.test.tsx
  Pagination.tsx
  Pagination.test.tsx
lib/
  match-calculator.ts
  match-calculator.test.ts
  values.ts
  values.test.ts
```

## Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

## Writing a Test — Template

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyComponent from './MyComponent'

describe('MyComponent', () => {
  it('renders the heading', () => {
    render(<MyComponent title="Hello" />)
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeVisible()
  })

  it('calls onSubmit when the form is submitted', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()

    render(<MyComponent onSubmit={handleSubmit} />)

    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(handleSubmit).toHaveBeenCalledWith('test@example.com')
  })

  it('shows an error when input is empty', async () => {
    const user = userEvent.setup()
    render(<MyComponent />)

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(screen.getByText('Email is required')).toBeVisible()
  })

  it('does not render the modal initially', () => {
    render(<MyComponent />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

## Quick Reference

| Do | Don't |
|---|---|
| Query by role, label, text | Query by test ID or class name |
| Assert with `toBeVisible()` | Assert with `toBeInTheDocument()` for visible content |
| Use `userEvent.setup()` | Use `fireEvent` for user interactions |
| Test what renders and what the user sees | Test internal state or implementation |
| Colocate test files with source | Put tests in separate `__tests__` folders |
| Mock at boundaries (network, DB) | Mock your own utilities and functions |
| Write integration-style tests | Over-isolate every unit |
| Create all state inside each `it()` block | Share mutable `let` variables across tests |
| Use `vi.fn()` only when you assert on it | Create tracked mocks you never check |
| Put helpers/constants at top scope | Nest shared helpers inside `describe` |
