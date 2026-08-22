-- Project 13 follow-up: businesses.plan was typed as the fixed 3-value subscription_plan
-- enum (starter/professional/enterprise). Confirmed live that this breaks the exact thing
-- this project explicitly promises ("Treat these as the initial plan keys only" -- more can
-- be added later via subscription_plans, a plain reference table with a text plan_key, no
-- schema change required): switching a business onto a hypothetical 4th plan throws
-- `invalid input value for enum subscription_plan` on the businesses.plan sync every
-- subscription function performs. businesses.plan is confirmed display-only (the Super Admin
-- directory badge, the settings page's read-only field -- neither gates any logic), so
-- widening it to text removes an artificial cap with no loss of any real constraint: the
-- REAL constraint now lives where it belongs, as a foreign key to subscription_plans.
ALTER TABLE public.businesses ALTER COLUMN plan DROP DEFAULT;
ALTER TABLE public.businesses ALTER COLUMN plan TYPE text USING plan::text;
ALTER TABLE public.businesses ALTER COLUMN plan SET DEFAULT 'starter';
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_plan_fkey FOREIGN KEY (plan) REFERENCES public.subscription_plans (plan_key);
