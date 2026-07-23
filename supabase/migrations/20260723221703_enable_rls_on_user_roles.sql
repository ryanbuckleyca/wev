-- Migration: Enable RLS on user_roles for defense-in-depth

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Note: Only SELECT is allowed for authenticated users. Modifications must go through service_role.
-- The service_role bypasses RLS by default, so backend processes will continue to work seamlessly.

CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
