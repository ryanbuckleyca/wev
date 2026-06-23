-- Add index to user_roles table for faster role lookups
-- This will speed up the admin role detection

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
