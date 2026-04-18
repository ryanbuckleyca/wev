import { z } from 'zod/v3';

export const MIN_PASSWORD_LENGTH = 8;

export const PasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  });

export const UpdatePasswordSchema = z.object({
  currentPassword: z.string({
    required_error: 'Current password is required.',
  }).min(1, 'Current password is required.'),
  newPassword: PasswordSchema,
});

export const UpdateEmailSchema = z.object({
  email: z.string().email('Invalid email format'),
});
