-- Validate the widened subtype CHECK added NOT VALID in
-- 20261117190000_org_governance_subtype_gov_3_2.sql. Separate migration so
-- ADD CONSTRAINT can commit before VALIDATE acquires its longer lock.

ALTER TABLE public.organizations
  VALIDATE CONSTRAINT organizations_governance_subtype_check;
