# Testing Guide — wev

_See [Principles of Automated Testing](https://www.lihaoyi.com/post/PrinciplesofAutomatedTesting.html) for the "why" behind these decisions. **Required reading** before writing tests in this codebase._

---

## Why We Write Tests

Every test we write should serve at least one of these purposes. When deciding _how_ to test something, consider which factors matter most for that piece of code.

| #   | Good tests can…                          | What it means                                                                                                                                        |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Verify the code is working correctly** | Confirm the current implementation does what we expect right now.                                                                                    |
| 2   | **Prevent future regressions**           | Catch breakage when someone changes code later — the safety net.                                                                                     |
| 3   | **Document the code's behaviour**        | A well-named test suite is living documentation — it tells the next developer what the code is _supposed_ to do, without reading the implementation. |
| 4   | **Provide design guidance**              | If something is hard to test, it's often hard to use. Writing tests pushes us toward simpler interfaces, smaller functions, and clearer boundaries.  |

Factors 1 and 2 are the standard reasons everyone cites. But the debates we have about testing — within teams and endlessly on the internet — usually stem from unarticulated differences in how we weigh factors 3 and 4. Keep all four in mind when choosing what and how to test.

_Adapted from Li Haoyi's [Principles of Automated Testing](https://www.lihaoyi.com/post/PrinciplesofAutomatedTesting.html)._

---

## Stack

| Tool                                                                                   | Package        | Purpose                                                     |
| -------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| [Vitest](https://vitest.dev/)                                                          | `wev-bulletin` | Fast, ESM-native test runner (Jest-compatible)              |
| [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro) | `wev-bulletin` | Render & query React components by user-visible behaviour   |
| [@testing-library/user-event](https://testing-library.com/docs/user-event/intro)       | `wev-bulletin` | Simulate realistic user interactions (clicks, typing, etc.) |
| [@testing-library/jest-dom](https://testing-library.com/docs/ecosystem-jest-dom)       | `wev-bulletin` | DOM matchers like `toBeVisible()`, `toBeDisabled()`         |
| pytest                                                                                 | `wev-scraper`  | Python test runner                                          |
| pytest-httpx / responses                                                               | `wev-scraper`  | Mock HTTP calls in scraper tests                            |
| pgTAP                                                                                  | `supabase/`    | SQL-native tests for DB functions and RLS policies          |
| [Playwright](https://playwright.dev/)                                                  | monorepo       | Cross-browser end-to-end coverage against the real app      |

Run Vitest and Next.js tasks with the Node version pinned in the repo's `.nvmrc`. Older Node releases can fail before the suite starts, so if tests crash at startup, check `nvm use` first.

---

## Coverage Targets

| Layer                                | Target                    |
| ------------------------------------ | ------------------------- |
| Business logic / utils (JS + Python) | 90%                       |
| React components                     | 80%                       |
| API routes / Server Actions          | 85%                       |
| Custom hooks                         | 85%                       |
| Scraper parsing logic                | 85%                       |
| DB tests (pgTAP)                     | 100% of defined scenarios |
| E2E critical flows                   | 100% of defined flows     |

**CI gate:** 80% lines/branches repo-wide. Fail below it.

---

## What to Test

**Always:**

- Pure functions and data transformers (JS and Python)
- Zod schemas — valid input, each invalid case, boundaries
- Scoring and matching logic — core to the product, test every dimension
- Component behaviour — interactions, conditional rendering, error/loading states
- API routes and Server Actions — auth check, happy path, validation error, DB error
- Scraper parsing logic — each source format, malformed input, missing fields
- DB query logic — correct filters, ordering, joins (mock the client)

**Never:**

- Third-party library internals (Supabase, React Query, next-intl, requests, BeautifulSoup)
- Generated code and types
- Config files (`next.config.ts`, `tailwind.config.ts`, etc.)
- One-liner wrappers covered incidentally by integration tests
- Snapshot tests for UI components
- CSS classnames or visual layout

---

## Running Tests

```bash
# Run all unit + integration tests
npm test

# Run DB tests (requires supabase start)
npm run test:db

# Watch mode
npm run test:watch --prefix wev-bulletin

# With coverage report
npm run test:coverage --prefix wev-bulletin

# Scraper
cd wev-scraper && pytest
cd wev-scraper && pytest --cov --cov-fail-under=85

# E2E
npm run test:e2e
npm run test:e2e:auth-email
npm run test:e2e:perf
```

---

## File Structure

Test files live **next to the files they test**, not in separate `__tests__` directories:

```
wev-bulletin/
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
  test-utils/
    i18n-navigation-mock.tsx   # shared `@/i18n/navigation` Link + `useRouter` stub (`mockRouterReplace` / `mockRouterPush`)
    require-admin-mock.ts
  e2e/
    tests/
    pages/
    support/

wev-scraper/
  scraper/
    parsers/
      base_coop.py
      base_coop_test.py
    conftest.py                # shared fixtures
```

Use `*.integration.test.ts` for tests that exercise multiple real pieces together while mocking only external boundaries. These run as part of the normal suite on every push.

---

## Playwright E2E

- Playwright always boots the local app against the dedicated `wev-test` database using the same `.env` values the app already uses.
- Specs live in `e2e/tests`, page objects live in `e2e/pages`, and shared helpers belong in `e2e/support`.
- `e2e/pages` owns locators and user actions. Keep support code small and focused on environment or database setup.
- The stable job-board e2e contract is defined in `lib/testing/job-board-contract.ts`. If a selector must survive refactors, add it there instead of scattering string literals through specs.
- `e2e/global-setup.ts` wipes and reseeds the local Supabase database before the suite runs, then calls `/api/revalidate-jobs` so Next.js does not serve stale cached job data.
- Start with Chromium only. Add more browsers once the suite is stable and the extra runtime is worth it.
- Add `data-testid` only when a role/label-based locator would be brittle across locales or layout refactors. Stable test IDs should be treated as part of the app's testing API.
- Keep performance checks in a separate `@perf` lane. They should run against the production build, disable heavy artifacts like trace/video, and assert a user-meaningful readiness milestone rather than a brittle raw `load` event.
- Run the main correctness suite with `npm run test:e2e` and the perf lane with `npm run test:e2e:perf`.
- Auth email E2E (`e2e/tests/auth-email.spec.ts`) is part of the main `npm run test:e2e` suite and can also be run alone with `npm run test:e2e:auth-email`.
- Auth email E2E uses Mailpit by default (local Supabase SMTP → Mailpit). Set `E2E_EMAIL_PROVIDER=mailslurp` plus `MAILSLURP_API_KEY` to use MailSlurp (auto-reuses inboxes tagged `wev-e2e-auth` when available; supports `MAILSLURP_INBOX_IDS` override). Without a MailSlurp key, the email helpers fall back to Mailpit.
- Playwright derives `SUPABASE_PROJECT_REF` from `SUPABASE_URL` when needed, so you do not need to maintain a separate project-ref secret for e2e.
- Playwright runs locally and in GitHub Actions (workflow starts local Supabase, builds the production Next.js app, then runs `npm run test:e2e`).

---

## Database Tests (pgTAP)

SQL functions, RPCs, and RLS policies are tested directly in Postgres using [pgTAP](https://pgtap.org/). Tests live in `supabase/tests/` and run via:

```bash
supabase test db
# or from the monorepo root:
npm run test:db
```

**When they run in CI:** Only when `supabase/migrations/**` or `supabase/tests/**` changes.

**Why pgTAP instead of Vitest:** The matching algorithm, RLS policies, and other DB functions are pure SQL. Testing them through a Node client adds unnecessary indirection. pgTAP runs the tests inside Postgres itself — faster, more precise, no Node boilerplate.

---

## Python / Scraper Tests (pytest)

- Test files live next to source (`base_coop_test.py` beside `base_coop.py`).
- Shared fixtures go in `conftest.py` at the appropriate level.
- Mock HTTP calls with `pytest-httpx` or `responses` — never make real network calls in unit tests.
- Use real fixture HTML/JSON sampled from each source. Cover the happy path, malformed input, and missing fields for every parser.
- DB interaction tests use a transaction rollback fixture so each test starts clean without a full reseed.

```python
# conftest.py — transaction rollback fixture
@pytest.fixture
def db_session():
    session = Session()
    session.begin_nested()
    yield session
    session.rollback()
```

---

## Guiding Principles

These principles come directly from the Testing Library philosophy:

> "If it relates to rendering components, then it should deal with DOM nodes rather than component instances, and it should not encourage dealing with component instances."

> "It should be generally useful for testing the application components in the way the user would use it."

> "Utility implementations and APIs should be simple and flexible."

### 1. Test User Behaviour, Not Implementation Details

Focus on **what the component renders** and **how it behaves**, not how it achieves that behaviour internally.

```tsx
// ❌ Bad — testing internal state / implementation
expect(component.state.isOpen).toBe(true);

// ✅ Good — testing what the user sees
expect(screen.getByRole("dialog")).toBeVisible();
```

Avoid accessing component internals, refs, or state directly. Interact with the component through the DOM, just as a user would.

### 2. Use the `screen` Object

Always use the `screen` object from `@testing-library/react` for queries. This reduces boilerplate and makes tests easier to read.

```tsx
// ❌ Avoid destructuring render
const { getByText } = render(<MyComponent />);

// ✅ Prefer screen
render(<MyComponent />);
expect(screen.getByText("Hello")).toBeVisible();
```

### 3. Prefer Accessible Queries

Choose queries that reflect how users (and assistive technology) find elements. The recommended priority:

| Priority | Query                  | When to use                             |
| -------- | ---------------------- | --------------------------------------- |
| 1st      | `getByRole`            | Buttons, links, headings, form controls |
| 2nd      | `getByLabelText`       | Form fields with labels                 |
| 3rd      | `getByPlaceholderText` | Inputs with placeholder text            |
| 4th      | `getByText`            | Non-interactive text content            |
| 5th      | `getByTestId`          | Last resort only                        |

```tsx
// ❌ Fragile — tied to test IDs or CSS classes
screen.getByTestId("submit-btn");

// ✅ Accessible — matches how users find the button
screen.getByRole("button", { name: "Submit" });
```

### 4. Use `toBeVisible()` Over `toBeInTheDocument()`

Elements can exist in the DOM but be hidden (`display: none`, `visibility: hidden`, etc.). Prefer `toBeVisible()` for positive assertions to verify the user can actually see the element.

```tsx
// ❌ Only checks DOM presence — element could be hidden
expect(screen.getByText("Success")).toBeInTheDocument();

// ✅ Confirms the element is visible to the user
expect(screen.getByText("Success")).toBeVisible();
```

Use `not.toBeInTheDocument()` when asserting an element is **completely absent** from the DOM (e.g. conditionally rendered content).

### 5. Use `userEvent` Over `fireEvent`

`userEvent` simulates full user interaction sequences (focus, keydown, keyup, input, click) rather than dispatching a single synthetic event. This catches more real-world bugs.

```tsx
// ❌ fireEvent dispatches a single event — incomplete simulation
fireEvent.click(button);

// ✅ userEvent simulates the full interaction
const user = userEvent.setup();
await user.click(button);
```

Always call `userEvent.setup()` at the top of each test that uses it.

**Exception — disabled submit buttons:** When the UI intentionally disables the submit control (e.g. missing CAPTCHA, password strength not met), the browser often will not run the form's `onSubmit` from Enter, and jsdom matches that. To still test the handler's validation branch, dispatch `fireEvent.submit` on the `<form>` element and add a short comment explaining why `userEvent` cannot reach that path. (This subsection is the canonical reference for that exception; avoid hard-coding section numbers in test comments.)

### 6. Favour Integration Over Isolation

Prefer tests that assess how components work together over isolated unit tests. This provides a more accurate representation of real-world usage. Only mock what you **must** (network requests, environment-specific APIs).

### 7. Minimize Mocking

Use real modules and dependencies where possible to ensure tests are meaningful and reliable. When mocking is unavoidable:

- Mock at the **boundary** (network, database, browser APIs), not inside your own code.
- Prefer lightweight stubs over complex mock implementations.
- If you find yourself mocking extensively, it may indicate the test scope is wrong.

```tsx
// ❌ Over-mocking — mocking your own utility
vi.mock("./calculateMatch", () => ({ calculateMatch: vi.fn() }));

// ✅ Better — use the real function, mock only the external boundary
vi.mock("@/lib/supabase/client");
```

### API route tests: admin gate (`requireAdminResponse`)

Routes that call `requireAdminResponse()` from `@/lib/auth/require-admin` should **not** hit real Supabase session/role logic in unit tests. Use the shared mock:

1. Import **`@/test-utils/require-admin-mock` first** (before importing the `route` handler) so Vitest registers the mock.
2. Use the exported **`mockRequireAdminResponse`** — e.g. `mockResolvedValue(null)` when the handler should proceed as admin, or `mockResolvedValue(adminGateUnauthorized())` for a 401-style denial (see `@/test-utils/admin-route`).

```ts
import { mockRequireAdminResponse } from "@/test-utils/require-admin-mock";
import { POST } from "./route";
import { adminGateUnauthorized } from "@/test-utils/admin-route";

// …

mockRequireAdminResponse.mockResolvedValue(adminGateUnauthorized());
```

Do **not** duplicate `vi.mock('@/lib/auth/require-admin', …)` in each file — use `test-utils/require-admin-mock.ts`, which registers the mock and exports **`mockRequireAdminResponse`** (`vi.mocked(requireAdminResponse)`).

### 8. Avoid Shared Mutable Variables

Each test should be fully isolated. Don't share mutable state (`let` variables, mock instances) between tests — it couples them and makes failures hard to trace. Define everything a test needs **inside the `it()` block**.

```tsx
// ❌ Bad — shared mutable variable across tests
describe("MyComponent", () => {
  let handler: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    handler = vi.fn();
  });

  it("calls handler on click", async () => {
    const user = userEvent.setup();
    render(<MyComponent onClick={handler} />);
    await user.click(screen.getByRole("button"));
    expect(handler).toHaveBeenCalled();
  });
});

// ✅ Good — each test creates its own state
describe("MyComponent", () => {
  it("calls handler on click", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<MyComponent onClick={handleClick} />);
    await user.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
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
};
```

### 9. Make Async Tests Deterministic

When a test needs to observe an intermediate loading state, do not rely on arbitrary delays like `setTimeout(100)` or other timing guesses. Prefer a deferred promise, a controlled mock, or fake timers so the test decides exactly when the async work resolves.

This keeps assertions stable in CI and local runs, especially for buttons that briefly switch to states like `Loading...` or `Deleting...`. Resolve the pending work explicitly in the test after asserting the intermediate UI.

### 10. Only Use `vi.fn()` for Functions You Assert On

`vi.fn()` creates a tracked mock. Only use it when you plan to assert on it (`toHaveBeenCalled`, `toHaveBeenCalledWith`, etc.). For callbacks you don't assert on, use a plain no-op function instead.

```tsx
// ❌ Bad — vi.fn() used but never asserted on
render(<Pagination onPageChange={vi.fn()} />);
// test only checks DOM text, never checks onPageChange

// ✅ Good — plain no-op for non-asserted callbacks
render(<Pagination onPageChange={() => {}} />);

// ✅ Good — vi.fn() used AND asserted on
const handleChange = vi.fn();
render(<Pagination onPageChange={handleChange} />);
await user.click(screen.getByRole("button", { name: "Next" }));
expect(handleChange).toHaveBeenCalledWith(2);
```

### 11. Keep Helpers and Constants in the Top Scope

Shared helper functions and immutable constants belong at the **top of the file** (outside `describe`), not nested inside it. This visually separates setup from test logic.

Sub-describe blocks may define their own helpers. Single-use helpers belong inside their `it()` block.

```tsx
// ✅ Preferred — helpers at top scope
import { render, screen } from "@testing-library/react";
import MyComponent from "./MyComponent";

const defaultProps = { title: "Hello", count: 5 };

function renderWithProps(overrides = {}) {
  return render(<MyComponent {...defaultProps} {...overrides} />);
}

describe("MyComponent", () => {
  it("renders the title", () => {
    renderWithProps();
    expect(screen.getByText("Hello")).toBeVisible();
  });
});
```

### 12. Don't Loop Over Assertions

Avoid `for` / `forEach` loops around `expect()` calls. When a loop-based assertion fails, the error message doesn't tell you _which_ iteration broke. Write each expectation explicitly — it's more readable and produces clear failure output.

```tsx
// ❌ Bad — which iteration failed?
for (let i = 1; i <= 5; i++) {
  expect(screen.getByRole("button", { name: String(i) })).toBeVisible();
}

// ✅ Good — each assertion is explicit and self-describing
expect(screen.getByRole("button", { name: "1" })).toBeVisible();
expect(screen.getByRole("button", { name: "2" })).toBeVisible();
expect(screen.getByRole("button", { name: "3" })).toBeVisible();
expect(screen.getByRole("button", { name: "4" })).toBeVisible();
expect(screen.getByRole("button", { name: "5" })).toBeVisible();
```

### 13. Verify AI-Generated Tests Can Fail

When using an AI coding tool to generate tests, treat the output as a first draft. After generation, break the relevant implementation (delete a line, flip a condition) and confirm the test goes red. Restore the code once verified. A test that stays green against a broken implementation is not a test.

**For AI agents writing tests:** after writing a test, temporarily break the implementation to confirm the test fails, then restore it before finishing.

---

## Writing a Test — Template

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyComponent from "./MyComponent";

describe("MyComponent", () => {
  it("renders the heading", () => {
    render(<MyComponent title="Hello" />);
    expect(screen.getByRole("heading", { name: "Hello" })).toBeVisible();
  });

  it("calls onSubmit when the form is submitted", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(<MyComponent onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(handleSubmit).toHaveBeenCalledWith("test@example.com");
  });

  it("shows an error when input is empty", async () => {
    const user = userEvent.setup();
    render(<MyComponent />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByText("Email is required")).toBeVisible();
  });

  it("does not render the modal initially", () => {
    render(<MyComponent />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

---

## Quick Reference

| Do                                        | Don't                                                 |
| ----------------------------------------- | ----------------------------------------------------- |
| Query by role, label, text                | Query by test ID or class name                        |
| Assert with `toBeVisible()`               | Assert with `toBeInTheDocument()` for visible content |
| Use `userEvent.setup()`                   | Use `fireEvent` for user interactions                 |
| Test what renders and what the user sees  | Test internal state or implementation                 |
| Colocate test files with source           | Put tests in separate `__tests__` folders             |
| Mock at boundaries (network, DB)          | Mock your own utilities and functions                 |
| Write integration-style tests             | Over-isolate every unit                               |
| Create all state inside each `it()` block | Share mutable `let` variables across tests            |
| Use `vi.fn()` only when you assert on it  | Create tracked mocks you never check                  |
| Put helpers/constants at top scope        | Nest shared helpers inside `describe`                 |
| Write each assertion explicitly           | Loop over `expect()` calls with `for`/`forEach`       |
| Verify AI-generated tests can fail        | Commit AI-generated tests without checking them       |

---

## Further Reading

- [Principles of Automated Testing](https://www.lihaoyi.com/post/PrinciplesofAutomatedTesting.html) — Li Haoyi's deep dive on the "why" behind testing decisions. The "Why We Write Tests" section above is adapted from this essay. **Required reading** before writing tests in this codebase.
- [Testing Library Docs](https://testing-library.com/docs/) — official guides for queries, `userEvent`, and `jest-dom` matchers.
- [About Queries](https://testing-library.com/docs/queries/about) — query priority reference (which query to reach for first).
- [UserEvent Introduction](https://testing-library.com/docs/user-event/intro) — why `userEvent` over `fireEvent`.
- [pgTAP Documentation](https://pgtap.org/)
- [pytest Documentation](https://docs.pytest.org/)
