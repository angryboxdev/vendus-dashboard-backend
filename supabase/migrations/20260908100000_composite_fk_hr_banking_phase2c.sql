-- Composite FKs, phase 2c: HR & banking domain
-- (`.scratch/composite-fk-indexes/issues/05-phase2c-fks-hr-banking.md`).
-- Closes the 12 pre-existing, caller-supplied references into `hr_employees`,
-- `hr_work_shifts`, `bank_accounts`, `banks`, `bank_movements` and
-- `bank_statement_imports` (ticket 01's audit) with
-- `FOREIGN KEY (org_id, <col>) REFERENCES <target> (org_id, id)`, built
-- online exactly like ADR-0009's location precedent: `NOT VALID` first (an
-- `ACCESS EXCLUSIVE` lock only long enough to record the constraint), then
-- `VALIDATE CONSTRAINT` in its own statement (`SHARE UPDATE EXCLUSIVE`,
-- blocks neither reads nor writes). This does not replace or drop any
-- existing single-column FK -- it adds the composite one alongside it, same
-- as the location migration did.
--
-- Per ticket 02's empirical finding, `supabase db reset` does NOT wrap a
-- migration file's statements in one enclosing transaction, so each
-- statement below commits (and releases its lock) independently -- the
-- `ACCESS EXCLUSIVE` from a `NOT VALID` add is gone well before that same
-- constraint's `VALIDATE CONSTRAINT` statement runs later in this file.
--
-- Every new composite FK mirrors the `ON DELETE` action of the existing
-- single-column FK it sits alongside (restrict/cascade/set null/no action,
-- per `20260822141653_remote_schema.sql`), so this migration only closes the
-- cross-tenant hole -- it does not change what happens on a parent delete.
--
-- `bank_movements` size check (ticket's own checkbox): local stack is
-- seed-scale (0 rows at migration time -- confirmed via
-- `select count(*) from bank_movements`), so it says nothing about
-- production. `bank_movements` is flagged by the ticket as carrying real
-- production data since day one; unlike `VALIDATE CONSTRAINT`'s lock
-- (`SHARE UPDATE EXCLUSIVE`, does not block concurrent reads or writes,
-- only conflicts with other DDL), the cost that scales with row count is
-- the validating scan's *duration*, not lock severity -- a full sequential
-- scan checking every existing row against both of `bank_movements`' two
-- new composite FKs (`bank_account_id`, `statement_import_id`) plus the one
-- referencing it (`bank_movement_entity_links.movement_id`). Per this
-- spec's own risk table and `docs/DEPLOY_SCOPED_ACCESS.md`'s identical
-- precedent for the location migration: check the actual production row
-- count (`select count(*) from bank_movements;` or `pg_stat_user_tables`)
-- before running this migration there, and confirm the resulting scan
-- duration is acceptable, rather than discovering it live -- this
-- implementation pass has no production access to do that check itself.
-- If the count turns out to be large enough that a several-second scan is a
-- concern, `VALIDATE CONSTRAINT` can be run as its own deploy step, off
-- peak, independent of the `NOT VALID` adds (which are metadata-only and
-- safe to run any time).

-- =============================================================================
-- 1. Attach each target's phase-1 UNIQUE (org_id, id) index as a real
--    constraint (`ADD CONSTRAINT ... UNIQUE USING INDEX`, no re-scan --
--    D2/ticket 02) so the composite FKs below have something to reference.
-- =============================================================================

alter table "public"."hr_employees"
  add constraint "hr_employees_org_id_id_key" unique using index "hr_employees_org_id_id_uq";

alter table "public"."hr_work_shifts"
  add constraint "hr_work_shifts_org_id_id_key" unique using index "hr_work_shifts_org_id_id_uq";

alter table "public"."bank_accounts"
  add constraint "bank_accounts_org_id_id_key" unique using index "bank_accounts_org_id_id_uq";

alter table "public"."banks"
  add constraint "banks_org_id_id_key" unique using index "banks_org_id_id_uq";

alter table "public"."bank_movements"
  add constraint "bank_movements_org_id_id_key" unique using index "bank_movements_org_id_id_uq";

alter table "public"."bank_statement_imports"
  add constraint "bank_statement_imports_org_id_id_key" unique using index "bank_statement_imports_org_id_id_uq";

-- =============================================================================
-- 2. NOT VALID composite FKs -- 12 references, ticket 01's audit
-- =============================================================================

-- -> hr_employees (5)
alter table "public"."hr_work_shifts"
  add constraint "hr_work_shifts_org_id_employee_id_fkey"
  foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
  on delete restrict not valid;

alter table "public"."hr_employee_payments"
  add constraint "hr_employee_payments_org_id_employee_id_fkey"
  foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
  on delete restrict not valid;

alter table "public"."hr_employee_documents"
  add constraint "hr_employee_documents_org_id_employee_id_fkey"
  foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
  on delete cascade not valid;

alter table "public"."hr_shift_attendance"
  add constraint "hr_shift_attendance_org_id_registered_by_employee_id_fkey"
  foreign key (org_id, registered_by_employee_id) references public.hr_employees (org_id, id)
  on delete set null not valid;

alter table "public"."cash_closings"
  add constraint "cash_closings_org_id_employee_id_fkey"
  foreign key (org_id, employee_id) references public.hr_employees (org_id, id)
  not valid;

-- -> hr_work_shifts (1)
alter table "public"."hr_shift_attendance"
  add constraint "hr_shift_attendance_org_id_work_shift_id_fkey"
  foreign key (org_id, work_shift_id) references public.hr_work_shifts (org_id, id)
  on delete cascade not valid;

-- -> bank_accounts (3)
alter table "public"."bank_movements"
  add constraint "bank_movements_org_id_bank_account_id_fkey"
  foreign key (org_id, bank_account_id) references public.bank_accounts (org_id, id)
  on delete set null not valid;

alter table "public"."bank_statement_imports"
  add constraint "bank_statement_imports_org_id_bank_account_id_fkey"
  foreign key (org_id, bank_account_id) references public.bank_accounts (org_id, id)
  not valid;

alter table "public"."recurring_occurrences"
  add constraint "recurring_occurrences_org_id_payment_bank_account_id_fkey"
  foreign key (org_id, payment_bank_account_id) references public.bank_accounts (org_id, id)
  not valid;

-- -> banks (1)
alter table "public"."bank_accounts"
  add constraint "bank_accounts_org_id_bank_id_fkey"
  foreign key (org_id, bank_id) references public.banks (org_id, id)
  not valid;

-- -> bank_movements (1)
alter table "public"."bank_movement_entity_links"
  add constraint "bank_movement_entity_links_org_id_movement_id_fkey"
  foreign key (org_id, movement_id) references public.bank_movements (org_id, id)
  on delete cascade not valid;

-- -> bank_statement_imports (1)
alter table "public"."bank_movements"
  add constraint "bank_movements_org_id_statement_import_id_fkey"
  foreign key (org_id, statement_import_id) references public.bank_statement_imports (org_id, id)
  on delete cascade not valid;

-- =============================================================================
-- 3. VALIDATE CONSTRAINT -- each in its own statement (SHARE UPDATE
--    EXCLUSIVE, does not block reads or writes). See the header note above
--    for the `bank_movements`-specific size/duration reasoning before
--    running this section against production.
-- =============================================================================

alter table "public"."hr_work_shifts" validate constraint "hr_work_shifts_org_id_employee_id_fkey";
alter table "public"."hr_employee_payments" validate constraint "hr_employee_payments_org_id_employee_id_fkey";
alter table "public"."hr_employee_documents" validate constraint "hr_employee_documents_org_id_employee_id_fkey";
alter table "public"."hr_shift_attendance" validate constraint "hr_shift_attendance_org_id_registered_by_employee_id_fkey";
alter table "public"."cash_closings" validate constraint "cash_closings_org_id_employee_id_fkey";
alter table "public"."hr_shift_attendance" validate constraint "hr_shift_attendance_org_id_work_shift_id_fkey";
alter table "public"."bank_movements" validate constraint "bank_movements_org_id_bank_account_id_fkey";
alter table "public"."bank_statement_imports" validate constraint "bank_statement_imports_org_id_bank_account_id_fkey";
alter table "public"."recurring_occurrences" validate constraint "recurring_occurrences_org_id_payment_bank_account_id_fkey";
alter table "public"."bank_accounts" validate constraint "bank_accounts_org_id_bank_id_fkey";
alter table "public"."bank_movement_entity_links" validate constraint "bank_movement_entity_links_org_id_movement_id_fkey";
alter table "public"."bank_movements" validate constraint "bank_movements_org_id_statement_import_id_fkey";
