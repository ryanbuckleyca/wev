/**
 * @deprecated This file is kept for backward compatibility.
 * Use the modular email utilities from './email' instead.
 *
 * Migration guide:
 * - import { createEphemeralInbox, waitForInboxLink } from './email'
 * - import type { InboxRef } from './email'
 */

export { createEphemeralInbox, waitForInboxLink } from "./email";
export type { InboxRef } from "./email";
