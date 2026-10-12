# D4 and the people model: one employee record, Novo RH tables around it

Decided by the user on 2026-10-11 (Phase 2 start).

## People model

The Novo RH does **not** create a second employee table. `hr_employees` stays
the single person record (one person = one row; legacy screens keep working);
Novo RH adds columns to it only where the spec needs them (first name, last
name, currency, deactivation) and puts everything else in new tables:
contracts, collective agreements, managers/approvers, compensation items and
assignments, custom fields. The UI stays separate (RH → Novo RH).

## D4 — personal data

- **Identification number (NIF) is mandatory and unique per organization**
  for records created or edited through the Novo RH (RE-2, Configurações C10
  #14). Enforced by the application and by a partial unique index on the
  normalized NIF. Legacy records without NIF (5 of 9 on 2026-10-11, checked
  read-only) are listed as "a completar"; nothing is blocked retroactively.
- **Mandatory fields = legal minimum:** first name, last name, NIF, hire date,
  main centre. Everything else (address, birth date, IBAN, NISS, contacts,
  nationality, gender) is optional and governed by field privacy (ADR-0024
  Phase 1, ticket 05).
- **Retention after termination:** a setting
  (`privacy.retention.years_after_termination`) with **no value** and
  `a_validar = true`. Nothing is anonymized automatically until the DPO sets
  it.

## Consequences

- RE-1 ("nome e apelido obrigatórios") applies to Novo RH writes; legacy
  `full_name` is kept in sync (`first_name + ' ' + last_name`).
- Deactivation keeps all data (RE-4) and revokes the linked user's sessions.
