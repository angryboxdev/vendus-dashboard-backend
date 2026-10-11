# D6: legal parameters exist without values; national holidays imported "to confirm"

Decided by the user on 2026-10-11 (Phase 3 start).

## Legal parameters

Every legal parameter of Portugal/Spain the new HR needs (minimum rest
between workdays, daily/weekly/annual hour limits, night work window,
minimum annual vacation days) is created in the configuration engine under a
new **`legal`** domain with **no value** (`defaultValue = null`) and
`legal = true`, `toValidate = true`. HR/legal fill them in Novo RH →
Configurações. Code never carries a legal number (task §4.5). While a
parameter has no value, rules that depend on it are **not applied** and the
screen says so — never a silent default.

Consequence for the engine: a setting's default may be `null` ("not defined");
the effective value may therefore be `null`.

## Holidays

Holiday calendars are per centre (assigned with validity to centres,
departments, groups or employees). **National Portuguese holidays** are
imported with the calculation the ERP already has (`calendar` module,
checked against 2024–2027), always with status **"a confirmar"**; an import
never replaces days that already exist (CF-10). Regional/municipal holidays
(Porto, Asturias, Catalonia) and Spanish national holidays are added by HR
with an official source. Only **confirmed** holidays zero the theoretical
time; "to confirm" ones are shown as a warning.

## Consequences

- Vacation calendars (Phase 3) store their own limit with no default; the
  balance ledger is Phase 5.
- The old `hr_public_holidays` / calendar module keeps serving the current HR;
  Novo RH calendars are new tables (`holiday_calendars`,
  `holiday_calendar_days`).
