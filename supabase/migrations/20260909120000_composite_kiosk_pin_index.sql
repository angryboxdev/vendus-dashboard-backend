-- Composite kiosk PIN index
-- (.scratch/kiosk-pin-storage-prefix/issues/01-composite-kiosk-pin-index.md,
-- spec.md Section A, DA1).
--
-- `hr_employees.kiosk_pin_hash` carried a global partial unique index
-- (`hr_employees_kiosk_pin_hash_uq`, migration `033_hr_kiosk_pin.sql`) -- a
-- 4-digit PIN space (10,000 values) shared across every organization. That
-- starts rejecting legitimate same-PIN assignments across organizations as
-- soon as a handful of organizations exist -- an operational problem, not a
-- security one: both PIN lookups (`findActiveEmployeeByPinHash`,
-- `SupabaseEmployeeRepository.findActiveByPinHash`) already filter by
-- organization before the `kiosk_pin_hash` predicate runs (confirmed by
-- reading the code and by this ticket's regression test), so this migration
-- only fixes the index's remaining job -- the cross-organization
-- PIN-collision hazard -- not a lookup gap.
--
-- CONCURRENTLY-in-a-transaction: per the composite-fk-indexes precedent
-- (`20260908090000_composite_fk_indexes_phase1.sql`), verified empirically
-- that `supabase db reset` does not wrap a migration file's statements in
-- one enclosing transaction -- `create unique index concurrently` applies
-- cleanly like any other migration statement, no manual out-of-band run
-- needed. The drop that follows is instant and does not need
-- `CONCURRENTLY`.

create unique index concurrently "hr_employees_kiosk_pin_hash_org_uq"
  on "public"."hr_employees" ("org_id", "kiosk_pin_hash")
  where ("kiosk_pin_hash" is not null);

drop index "public"."hr_employees_kiosk_pin_hash_uq";
