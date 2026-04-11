/** Normalized role strings from `user_roles.roles` (JSON array). */
export function parseRolesColumn(roles: unknown): string[] {
  if (Array.isArray(roles)) {
    const parsed = roles
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (parsed.length > 0) {
      return Array.from(new Set(parsed));
    }
  }

  return ['user'];
}

/** Case-insensitive membership check for a single role name. */
export function rolesIncludeRole(roles: string[], roleName: string): boolean {
  const needle = roleName.toLowerCase();
  return roles.some((r) => r.toLowerCase() === needle);
}

export function rolesIncludeAdmin(roles: string[]): boolean {
  return rolesIncludeRole(roles, 'admin');
}

export function rolesIncludeModerator(roles: string[]): boolean {
  return rolesIncludeRole(roles, 'moderator');
}

/** Admin or moderator — useful for “staff” actions below full admin. */
export function rolesIncludeStaff(roles: string[]): boolean {
  return rolesIncludeAdmin(roles) || rolesIncludeModerator(roles);
}
