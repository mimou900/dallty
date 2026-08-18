-- Replaces the BEFORE INSERT trigger for bookings.reference with a plain column DEFAULT
-- calling the same generator function. Functionally identical (still fires per-row, still
-- only used when the insert doesn't supply a value), but a column DEFAULT is what the
-- Supabase type generator uses to mark a NOT NULL column optional on Insert — the trigger
-- version left every insert call site needing to satisfy a `reference: string` it should
-- never actually set itself.
DROP TRIGGER IF EXISTS bookings_before_insert_reference ON public.bookings;
DROP FUNCTION IF EXISTS public.bookings_set_reference();

ALTER TABLE public.bookings ALTER COLUMN reference SET DEFAULT public.generate_booking_reference();
