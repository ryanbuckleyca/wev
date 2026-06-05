import { describe, it, expect } from 'vitest';
import { PasswordSchema, UpdatePasswordSchema, UpdateEmailSchema, MIN_PASSWORD_LENGTH } from './account';

describe('account schemas', () => {
  describe('PasswordSchema', () => {
    it('should validate a valid password', () => {
      const result = PasswordSchema.safeParse('password123');
      expect(result.success).toBe(true);
    });

    it('should fail for passwords shorter than MIN_PASSWORD_LENGTH', () => {
      const shortPassword = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
      const result = PasswordSchema.safeParse(shortPassword);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
    });
  });

  describe('UpdatePasswordSchema', () => {
    it('should validate a valid password update', () => {
      const data = {
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
      };
      const result = UpdatePasswordSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should fail if currentPassword is empty', () => {
      const data = {
        currentPassword: '',
        newPassword: 'new-password-123',
      };
      const result = UpdatePasswordSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Current password is required.');
      }
    });

    it('should fail if newPassword is too short', () => {
      const data = {
        currentPassword: 'old-password',
        newPassword: 'short',
      };
      const result = UpdatePasswordSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateEmailSchema', () => {
    it('should validate a valid email', () => {
      const result = UpdateEmailSchema.safeParse({ email: 'test@example.com' });
      expect(result.success).toBe(true);
    });

    it('should fail for invalid email format', () => {
      const result = UpdateEmailSchema.safeParse({ email: 'invalid-email' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Invalid email format');
      }
    });

    it('should fail for empty email', () => {
      const result = UpdateEmailSchema.safeParse({ email: '' });
      expect(result.success).toBe(false);
    });
  });
});
