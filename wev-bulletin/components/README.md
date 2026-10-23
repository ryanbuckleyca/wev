# UI Components

This project uses [shadcn/ui](https://ui.shadcn.com/) for UI components, which are built on Radix UI primitives and styled with Tailwind CSS.

### Installing Components

Components are installed individually using the shadcn CLI:

```bash
npx shadcn@latest add <component-name>
```

Example:

```bash
npx shadcn@latest add tooltip
npx shadcn@latest add button
```

Installed components are added to `components/ui/` and can be customized as needed. They're not imported from a package - they become part of your codebase.

### Component Guidelines

#### Core navigation building blocks

This application uses four related components for actions and navigation:

**Button Component**

- **Purpose:** Pure actions that don't navigate
- **Use for:** Form submission, modal triggers, API calls, state toggles, clipboard operations
- **Behavior:** Triggers onClick handlers, no navigation
- **Appearance:** Button styling with variants (primary, secondary, outline)

**LinkButton Component**

- **Purpose:** Navigation that looks like a button
- **Use for:** Page navigation where button appearance is desired
- **Behavior:** Navigates to a new page. **`prefetch` defaults to `false`** to avoid prefetching every visible target; pass **`prefetch={true}`** on routes where snappier navigation matters
- **Appearance:** Identical to Button component styling

**StyledLink Component** (`components/StyledLink.tsx`)

- **Purpose:** Navigation with shared link styling (primary, secondary, outline, text)
- **Use for:** Inline or compact nav (e.g. “Edit profile” in filters)
- **Behavior:** Same **`prefetch` default as `LinkButton`** (`false`, opt in with `prefetch={true}`)

**Link Component**

- **Purpose:** Navigation that looks like text (use `next/link` or, in this app, `Link` from `@/i18n/navigation` for locale-aware URLs)
- **Use for:** Text links within content, secondary navigation
- **Behavior:** Navigates to a new page. **`prefetch` follows Next.js defaults** unless you set `prefetch` explicitly (many auth screens omit it and get the framework default)
- **Appearance:** Text styling with underline on hover

#### Button Component

Use `<Button>` for actions that modify state or trigger events:

- Form submission (Save, Update, Delete)
- Modal/dropdown triggers
- API calls and workflows
- UI state toggles (theme, filters)
- Clipboard operations

```tsx
import Button from '@/components/Button'

// ✅ Correct: Form action
<Button type="submit">Save Profile</Button>

// ✅ Correct: API action
<Button onClick={handleCopy}>Copy to Clipboard</Button>

// ✅ Correct: Modal trigger
<Button onClick={() => setIsOpen(true)}>Open Modal</Button>
```

#### LinkButton Component

Use `<LinkButton>` for navigation between pages when button appearance is desired:

- Page navigation (Profile, Settings, Login)
- Primary navigation actions
- Any navigation that needs button styling
- **Prefetch:** defaults to **`false`**. Pass **`prefetch={true}`** when you want Next.js to prefetch that route (e.g. a primary destination users often open next)

```tsx
import LinkButton from '@/components/LinkButton'

// ✅ Correct: Page navigation with button appearance (no automatic prefetch)
<LinkButton href="/profile">View Profile</LinkButton>

// ✅ Correct: Opt in to prefetch for a hot path
<LinkButton href="/account-settings" prefetch={true}>
  Account Settings
</LinkButton>
```

#### StyledLink Component

`StyledLink` wraps the same i18n `Link` with shared styles; **`prefetch` defaults to `false`** for the same reasons as `LinkButton`. Use **`prefetch={true}`** when you explicitly want prefetching.

#### Link Component

Use `<Link>` (from `next/link`, or **`@/i18n/navigation`** in this app) for text-style navigation:

- Links within content paragraphs
- Secondary navigation
- Cross-references in help text
- **Prefetch:** Next.js default unless you pass `prefetch={false}` (some shell UI sets `prefetch={false}` to avoid redundant work)
- **Colors**: Muted Teal (unvisited) → Dusty Lavender (visited)

```tsx
import { Link } from '@/i18n/navigation'

// ✅ Correct: Text link (uses Next.js prefetch defaults for eligible routes)
<Link href="/account-settings" className="text-[var(--primary)] hover:underline visited:text-[var(--accent)]">
  Go to Account Settings
</Link>

// ✅ Correct: Explicit prefetch control
<p>
  Visit our{' '}
  <Link href="/help" prefetch={false} className="text-[var(--primary)] hover:underline visited:text-[var(--accent)]">
    help page
  </Link>{' '}
  for more info.
</p>
```

### Button Layout Best Practices

Follow our **left-secondary, right-primary** pattern for consistent UX:

#### Two-Button Layouts

```tsx
// ✅ Correct: Secondary on left, Primary on right
<div className="flex justify-between gap-3">
  <LinkButton href="/" variant="outline">
    Back to Jobs
  </LinkButton>
  <Button type="submit">Save Profile</Button>
</div>
```

#### Single Action Forms

```tsx
// ✅ Correct: Center single primary action
<div className="text-center">
  <Button type="submit">Submit</Button>
</div>
```

#### Layout Rules

- **Left side**: Secondary actions (cancel, back, navigate away)
- **Right side**: Primary actions (save, submit, confirm)
- **Spacing**: Use `gap-3` or `gap-4` for consistent spacing
- **Variants**: Outline/secondary for left, primary for right
- **Single actions**: Center align primary buttons

### Performance Features

- **Link prefetching:** `LinkButton` and `StyledLink` default to **`prefetch={false}`** so lists and menus do not trigger broad route prefetching. Opt in per link with **`prefetch={true}`** where it helps. Plain **`Link`** components use **Next.js defaults** unless `prefetch` is set (see [Next.js `Link` prefetching](https://nextjs.org/docs/app/api-reference/components/link#prefetch)).
- **Client-side Routing**: Uses Next.js router for SPA-like navigation
- **Semantic HTML**: Proper button/link elements for accessibility
