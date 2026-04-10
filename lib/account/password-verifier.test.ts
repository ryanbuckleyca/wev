import { describe, it, expect } from 'vitest';
import { PasswordVerifier, ValidationError } from './password-verifier';

describe('PasswordVerifier', () => {
  describe('input validation', () => {
    it('rejects empty email', async () => {
      const verifier = new PasswordVerifier();
      
      await expect(
        verifier.verify('', 'password123', null)
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid email format', async () => {
      const verifier = new PasswordVerifier();
      
      await expect(
        verifier.verify('not-an-email', 'password123', null)
      ).rejects.toThrow(ValidationError);
    });

    it('rejects email without domain', async () => {
      const verifier = new PasswordVerifier();
      
      await expect(
        verifier.verify('user@', 'password123', null)
      ).rejects.toThrow(ValidationError);
    });

    it('rejects empty password', async () => {
      const verifier = new PasswordVerifier();
      
      await expect(
        verifier.verify('user@example.com', '', null)
      ).rejects.toThrow(ValidationError);
    });

    it('rejects password shorter than 8 characters', async () => {
      const verifier = new PasswordVerifier();
      
      await expect(
        verifier.verify('user@example.com', 'short', null)
      ).rejects.toThrow(ValidationError);
    });

    it('rejects empty captcha token when provided', async () => {
      const verifier = new PasswordVerifier();
      
      await expect(
        verifier.verify('user@example.com', 'password123', '   ')
      ).rejects.toThrow(ValidationError);
    });

    it('rejects captcha token that is too short', async () => {
      const verifier = new PasswordVerifier();
      
      await expect(
        verifier.verify('user@example.com', 'password123', 'short')
      ).rejects.toThrow(ValidationError);
    });

    it('accepts valid inputs with null captcha', async () => {
      const verifier = new PasswordVerifier();
      
      // This will fail at auth stage (not validation) since we don't have real credentials
      await expect(
        verifier.verify('user@example.com', 'password123', null)
      ).rejects.not.toThrow(ValidationError);
    });

    it('trims whitespace from email', async () => {
      const verifier = new PasswordVerifier();
      
      // Should not throw validation error for whitespace
      await expect(
        verifier.verify('  user@example.com  ', 'password123', null)
      ).rejects.not.toThrow(ValidationError);
    });
  });
});
