import { describe, it, expect } from 'vitest';
import {
  parseRolesColumn,
  rolesIncludeAdmin,
  rolesIncludeModerator,
  rolesIncludeRole,
  rolesIncludeStaff,
} from './user-roles';

describe('parseRolesColumn', () => {
  it('returns default user role for non-arrays', () => {
    expect(parseRolesColumn(null)).toEqual(['user']);
    expect(parseRolesColumn(undefined)).toEqual(['user']);
    expect(parseRolesColumn('admin')).toEqual(['user']);
  });

  it('parses string array, trims, dedupes', () => {
    expect(parseRolesColumn([' admin ', 'user', 'admin'])).toEqual(['admin', 'user']);
  });

  it('returns user when array is empty after filtering', () => {
    expect(parseRolesColumn(['', '  '])).toEqual(['user']);
  });
});

describe('rolesIncludeAdmin', () => {
  it('is case-insensitive', () => {
    expect(rolesIncludeAdmin(['Admin'])).toBe(true);
    expect(rolesIncludeAdmin(['ADMIN'])).toBe(true);
  });

  it('returns false without admin', () => {
    expect(rolesIncludeAdmin(['user', 'moderator'])).toBe(false);
  });
});

describe('rolesIncludeRole', () => {
  it('matches role name case-insensitively', () => {
    expect(rolesIncludeRole(['Foo', 'bar'], 'FOO')).toBe(true);
    expect(rolesIncludeRole(['user'], 'admin')).toBe(false);
  });
});

describe('rolesIncludeModerator and rolesIncludeStaff', () => {
  it('detects moderator case-insensitively', () => {
    expect(rolesIncludeModerator(['Moderator'])).toBe(true);
    expect(rolesIncludeStaff(['moderator'])).toBe(true);
    expect(rolesIncludeStaff(['user'])).toBe(false);
  });

  it('staff is admin or moderator', () => {
    expect(rolesIncludeStaff(['admin'])).toBe(true);
    expect(rolesIncludeStaff(['moderator'])).toBe(true);
    expect(rolesIncludeStaff(['user'])).toBe(false);
  });
});
