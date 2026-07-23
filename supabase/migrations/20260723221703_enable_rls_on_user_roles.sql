-- Migration: Enable RLS on user_roles for defense-in-depth

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Note: We intentionally do not create any RLS policies for anon or authenticated roles.
-- The service_role bypasses RLS by default, so backend processes will continue to work seamlessly.
