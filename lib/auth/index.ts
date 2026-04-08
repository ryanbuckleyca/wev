/**
 * Role parsing & membership helpers (safe for client and server).
 *
 * Server-only pieces live alongside this folder but are **not** re-exported here,
 * so `import { … } from '@/lib/auth'` never pulls in `require-admin` or the logger.
 *
 * - Session gates: `@/lib/auth/require-admin`
 * - Service-role `user_roles` read: `@/lib/auth/server-user-roles`
 */
export { PASSWORD_FIELD_PLACEHOLDER } from './constants';
export {
  parseRolesColumn,
  rolesIncludeAdmin,
  rolesIncludeModerator,
  rolesIncludeRole,
  rolesIncludeStaff,
} from './user-roles';
