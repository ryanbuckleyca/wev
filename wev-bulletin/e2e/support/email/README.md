# Email Testing Utilities

Modular, testable utilities for E2E email testing with MailSlurp.

## Architecture

The original 276-line `mailslurp.ts` has been refactored into focused, single-responsibility modules:

```
email/
├── index.ts              # Public API exports
├── mailslurp-client.ts   # Factory and public interface
├── inbox-manager.ts      # Inbox lifecycle and pooling (120 lines)
├── email-waiter.ts       # Email polling and link extraction (180 lines)
├── url-extractor.ts      # URL parsing and normalization (100 lines)
└── url-extractor.test.ts # Unit tests for URL extraction
```

## Benefits

### 1. Testability
- Each class can be unit tested independently
- No need to hit MailSlurp API for URL extraction tests
- Mock dependencies easily for integration tests

### 2. Maintainability
- Each file has a single, clear responsibility
- Functions are 5-20 lines instead of 100+
- No duplicated code (removed 4 duplicate function calls)

### 3. Extensibility
- Easy to add new email providers (implement same interface)
- URL extraction logic can be customized per provider
- Polling strategy can be swapped out

### 4. Readability
- Clear class and method names
- Constants instead of magic numbers
- Comprehensive JSDoc comments

## Usage

### Basic Usage (unchanged API)

```typescript
import { createEphemeralInbox, waitForInboxLink } from './email';

// Create an inbox
const inbox = await createEphemeralInbox();

// Wait for an email with a specific link
const verifyUrl = await waitForInboxLink(
  inbox.id,
  '/auth/callback',
  120_000 // timeout in ms
);
```

### Advanced Usage (new capabilities)

```typescript
import { EmailUrlExtractor, InboxManager, EmailWaiter } from './email';

// Use URL extractor independently
const extractor = new EmailUrlExtractor();
const url = extractor.extractMatchingUrl(emailBody, 'verify');

// Manage inboxes with custom MailSlurp client
const manager = new InboxManager(customMailSlurpClient);
const inbox = await manager.getOrCreateInbox();

// Wait for emails with custom options
const waiter = new EmailWaiter(customMailSlurpClient);
const link = await waiter.waitForLink(inbox.id, 'reset', {
  timeoutMs: 60_000,
  since: new Date('2024-01-01'),
});
```

## Key Improvements

### 1. Eliminated Code Duplication

**Before:** `extractLinkFromRecentEmails` called 4 times
```typescript
const recovered = await extractLinkFromRecentEmails(...);
if (recovered) return recovered;
// ... repeated 3 more times
```

**After:** Single method with clear retry logic
```typescript
private async searchRecentEmails(...): Promise<string | null>
```

### 2. Separated Concerns

**Before:** One function did everything
- Poll for emails
- Extract URLs
- Handle timeouts
- Check quota
- Retry logic

**After:** Each class has one job
- `EmailWaiter`: Polling and retry logic
- `EmailUrlExtractor`: URL parsing
- `InboxManager`: Inbox lifecycle

### 3. Better Error Handling

**Before:** Silent failures
```typescript
} catch {
  // ignore probe failures
}
```

**After:** Logged warnings
```typescript
} catch (error) {
  console.warn('[MailSlurp] Failed to check for missed emails:', error);
  return null;
}
```

### 4. Testable URL Extraction

**Before:** Inline regex and string manipulation
```typescript
const hrefMatches = Array.from(normalizedText.matchAll(/href=(?:"|')([^"']+)(?:"|')/gi)).map(
  (match) => match[1],
);
```

**After:** Testable methods with clear names
```typescript
private extractHrefUrls(content: string): string[]
private extractPlainUrls(content: string): string[]
private normalizeUrl(url: string): string
```

### 5. Eliminated Global State

**Before:** Module-level mutable state
```typescript
let pooledInboxIndex = 0;
let discoveredInboxIds: string[] | null = null;
```

**After:** Encapsulated in class instances
```typescript
class InboxManager {
  private pooledInboxIndex = 0;
  private discoveredInboxIds: string[] | null = null;
}
```

## Testing

Run unit tests:
```bash
npm test e2e/support/email/url-extractor.test.ts
```

The URL extractor has comprehensive test coverage including:
- Plain text URL extraction
- HTML href attribute parsing
- Quoted-printable encoding
- HTML entity decoding
- Edge cases (malformed HTML, multiple URLs, etc.)

## Migration Guide

The old `mailslurp.ts` file is kept for backward compatibility and re-exports from the new modules. No changes needed to existing test files.

To use the new modular structure:

```typescript
// Old (still works)
import { createEphemeralInbox, waitForInboxLink } from './mailslurp';

// New (recommended)
import { createEphemeralInbox, waitForInboxLink } from './email';
```

## Future Enhancements

1. **Email Provider Abstraction**
   ```typescript
   interface EmailProvider {
     createInbox(): Promise<InboxRef>;
     waitForEmail(criteria: EmailCriteria): Promise<Email>;
   }
   ```

2. **Exponential Backoff**
   Replace fixed 5s delays with: 1s, 2s, 4s, 8s, 16s...

3. **Result Caching**
   Cache `searchRecentEmails` results to avoid redundant API calls

4. **Configurable Logging**
   Replace `console.log` with structured logger

## Performance Characteristics

- **Inbox creation**: ~500ms (or instant if pooled inbox available)
- **Email wait**: 1-120s depending on email delivery
- **URL extraction**: <1ms (pure computation)
- **Recent email search**: ~200ms per 20 emails

## Constants

```typescript
DEFAULT_TIMEOUT_MS = 120_000      // 2 minutes
DEFAULT_LOOKBACK_MS = 120_000     // 2 minutes
MAX_WAIT_WINDOW_MS = 45_000       // 45 seconds
RETRY_DELAY_MS = 5_000            // 5 seconds
MAX_RECENT_EMAILS = 20            // emails to check
```
