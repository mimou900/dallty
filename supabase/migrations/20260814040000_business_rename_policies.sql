-- Business/Salon Terminology Rename, migration 4 of 4: cosmetic policy
-- renames. Every policy below is already functionally correct after
-- migration 1 (verified in Task 1 Step 3) — this only renames the policy
-- itself so `\d+ businesses` and friends don't show a stale "salon" name to
-- the next person reading the schema. Only policies whose NAME actually
-- contains "salon" are listed (renaming a policy to its current name would
-- be a pointless no-op statement).

ALTER POLICY "Staff and owners create bookings for their salon" ON public.bookings RENAME TO "Staff and owners create bookings for their business";
ALTER POLICY "Anyone reads gallery of active salons" ON public.business_gallery RENAME TO "Anyone reads gallery of active businesses";
ALTER POLICY "Anyone reads salon hours" ON public.business_hours RENAME TO "Anyone reads business hours";
ALTER POLICY "Owners manage salon hours" ON public.business_hours RENAME TO "Owners manage business hours";
ALTER POLICY "Owners delete salons" ON public.businesses RENAME TO "Owners delete businesses";
ALTER POLICY "Owners insert salons" ON public.businesses RENAME TO "Owners insert businesses";
ALTER POLICY "Owners update salons" ON public.businesses RENAME TO "Owners update businesses";
ALTER POLICY "Public reads approved salons" ON public.businesses RENAME TO "Public reads approved businesses";
ALTER POLICY "Requester and salon managers read requests" ON public.staff_join_requests RENAME TO "Requester and business managers read requests";
ALTER POLICY "Salon managers review requests" ON public.staff_join_requests RENAME TO "Business managers review requests";
