# Project status: gradual migration

This **backend** is in **gradual migration** to the hexagonal architecture
described in `CLAUDE.md`. Today two patterns coexist:

- **New pattern** (hexagonal): the reference for ALL new work.
- **Legacy pattern**: most of the code is still here. It's being migrated
  gradually, one module at a time.

**Critical rule:** most of the surrounding code is legacy. This is **not**
an endorsement. Never imitate a legacy module's structure when writing new
code. The source of truth for the pattern is: (1) `CLAUDE.md`'s rules and
(2) the reference module (`src/modules/tasks`) — never neighboring code.

**How to tell which pattern a module follows:** open the module's own
`README.md` and check the `Status` field. No README, or a legacy status
(`legado` in the existing Portuguese READMEs, `legacy` in new ones) — treat
it as legacy and don't copy it.
