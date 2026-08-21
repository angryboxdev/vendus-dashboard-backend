# CLAUDE.md

Guidelines for this project. They apply to **all** code work. Don't develop
outside them. If a request conflicts with these rules, stop and let me know
before proceeding.

## Repositories (back + front)

This product lives in two separate repositories, and **the rules in this file
apply equally to both** — same hexagonal architecture, same `src/modules/`
structure, same boundary lint, same testing and documentation discipline.

- **Backend** — this repository, where you're running.
- **Frontend** — separate repository. Local path (my machine's setup):
  `/Users/raulafonso/Documents/r4ff/vendus-dashboard/vendus-dashboard-frontend`

The architecture is the same; what changes is the **nature of the adapters**
and the **libraries banned from the domain** in each repo:

|           | Input adapter                  | Output adapter                             | Domain must NOT import              |
| --------- | ------------------------------ | ------------------------------------------ | ------------------------------------ |
| **Back**  | HTTP controller, CLI, consumer | DB repository, API gateway, queue          | ORM, DB client, HTTP SDK            |
| **Front** | UI component/hook              | HTTP/API client, storage, etc.             | React, `fetch`/axios, DOM/browser APIs |

Additional rules when working on the front end:

1. **Read the front end's own `CLAUDE.md`** and its reference module before
   coding. Each repo has its own reference module and its own way of
   tracking which modules have migrated.
2. **Keep the back/front contract in sync:** when you change endpoints,
   request/response formats or shared types on one side, adjust the other
   side in the same task and flag it if something ends up incompatible.

## Project status

This backend is mid-migration to the hexagonal architecture below. Most of
the code is still legacy — never imitate it. Read
`docs/agents/project-status.md` before touching a module you're unsure
about; it explains how to tell the new pattern from legacy and names the
reference module.

## Stack

Before writing code, read `package.json` (and configs like `tsconfig.json`,
`jest.config`, `.eslintrc`) to identify the framework, libraries and
conventions already in use, and follow them. Don't introduce new
dependencies without asking me.

## Architecture: hexagonal (ports & adapters)

Every new module follows this structure, inside `src/modules/<module>/`:

```
domain/
  entities/      entities and value objects — NO external dependencies
  ports/in/      input ports: use case interfaces
  ports/out/     output ports: repo/gateway interfaces
  services/      pure business logic
application/
  use-cases/     implement the input ports, orchestrate the domain
adapters/
  in/            http, cli, event consumers (call the domain)
  out/           concrete implementations: db, apis, queues
<module>.module.ts   composition root: assembles the module and injects adapters
README.md            module documentation (see docs/agents/module-readme-template.md)
```

**Reference module:** use `src/modules/tasks` as the model for structure and
style. When in doubt about where something belongs, copy its pattern. It's
the only pattern reference — never use a legacy module as a model.

### Dependency rules (non-negotiable)

1. **`domain/` doesn't import from `adapters/` or infra libraries.** No DB
   client, HTTP SDK, ORM etc. inside `domain/`. If the domain needs something
   external, it declares an **output port** (interface) and something
   outside implements it.
2. **Dependencies cross via interface, never via concrete implementation.**
   Use cases receive output ports through the constructor (dependency
   injection).
3. **The composition root (`<module>.module.ts`) is the only place that
   knows the concrete adapters.** That's where you "plug in" which
   implementation goes in. In tests, fakes get plugged in instead.

Dependency arrows always point toward the domain.

## Before changing a module (default behavior, without me asking)

1. **Identify the module's pattern.** Check the module's own README `Status`
   field (see `docs/agents/project-status.md` for what new-pattern vs legacy
   means). If **legacy**: don't extend or replicate the old pattern. Make
   the minimal requested change, and if the change is large, suggest
   migrating the module to the new pattern first (see
   `docs/agents/legacy-module-refactor.md`). Ask me before starting a
   migration.
2. **Read the module's `README.md`** before any change. Pay special
   attention to the "Design decisions" section — don't undo deliberate
   choices. If the change touches a domain concept or a decision that
   crosses more than one module, also check `CONTEXT.md` and `docs/adr/` at
   the repo root.
3. Identify whether the change touches domain, ports or adapters, and
   respect the dependency rules above.

## After changing a module (default behavior, without me asking)

1. **Run the module's tests** and make sure they pass before considering the
   task done. If a hook didn't run, run the command from the module
   README's "How to test" section.
2. **Update the `README.md`** if the change altered ports, adapters, or a
   domain concept / design decision **local to this module**. Outdated docs
   are worse than no docs.
   If the domain concept is used by more than one module, or the decision is
   architectural (hard to reverse, would surprise a future reader, or came
   from a real trade-off between alternatives), record it in `CONTEXT.md` /
   `docs/adr/` instead of the README — see `docs/agents/domain.md`.
3. All new domain/use-case logic ships with a unit test (with fakes for the
   output ports). New adapters ship with an integration test where
   applicable.

## Tests

- Runner: **Jest**.
- Domain and use cases: fast, isolated tests using fakes for the output
  ports. Don't spin up a DB or network to test business rules.
- Adapters: separate integration tests.

## Module documentation — README template

Every module has a `README.md` following a fixed template. See
`docs/agents/module-readme-template.md` before creating or updating one.

## Refactoring legacy modules

Refactors are gradual, module by module, never a big bang. See
`docs/agents/legacy-module-refactor.md` before starting one — ask me first.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
