# Interface languages: pt-PT now, es-ES later; time zones per centre

Task RH (phased), Phase 0, decision D13. Decided by the user on 2026-10-11:
**pt-PT now, es-ES later.**

- The frontend gets a small i18n base with no new dependency
  (`src/i18n/`): typed message catalogues per locale, `t(key, params)`,
  and `Intl` formatters for dates, times and numbers. pt-PT is the source
  catalogue; es-ES exists with the same keys and falls back to pt-PT for
  keys not yet translated.
- New "Novo RH" screens use `t()` from the start; existing screens are not
  migrated in bulk.
- Supported time zones: `Europe/Lisbon` and `Europe/Madrid` (centres in
  Porto, Asturias and Catalonia). Instants are stored in UTC with the
  centre's zone; the workday is computed in the centre's zone (task §5,
  TK-12).
- All UI texts are written from scratch (task §4.1).

## Consequences

The DoD item "texts in pt-PT and es-ES" is met for pt-PT in each phase and
for es-ES when the Spanish translation is done (before Spanish centres go
live); the gate reports list the untranslated keys.
