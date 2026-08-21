# Module README template

Every module has a `README.md` at the root of its folder following exactly
this format:

````markdown
# Module: <name>

> Status: active | in-refactor | legacy
> Last updated: <date>

---

## What it is and what it's for (business perspective)

The real-world problem context — who uses it, when, why it exists.

**The problem it solves:**
The concrete pain without this module (1-3 sentences).

**The flow from the business's point of view:**

```
Actor A                              Actor B
──────────────────────              ──────────────────────
1. Does X
2. Confirms Y                   →   3. Sees Z
                                    4. Approves or rejects
```

**Key concepts for the business:**

- **Term A** — definition in non-technical language.
- **Term B** — definition in non-technical language.

---

## Technical purpose

What it solves technically (2-3 sentences). What it is and what it is NOT responsible for.

## Domain concepts

Main entities / value objects and invariant business rules.

## Ports

### Input (use cases)

- `UseCaseName` — what it does, when it's called.

### Output (domain dependencies)

- `RepoName` / `GatewayName` — what the domain expects from this interface.

## Adapters

### Input

- `HttpController` → exposes the use cases via REST at `/route`.

### Output

- `PostgresXRepo` → implements `RepoName` using <technology>.

## Design decisions (ADR summary)

Non-obvious decisions and the WHY.

## How to test

- Domain/use cases: `<command>` (fast, with fakes).
- Adapters: `<integration command>`.

## Known gaps / open debt

What's still not ideal (especially in legacy modules).
````

**Scope of "Domain concepts" and "Design decisions" in the README:** cover
only what's local to this module. A domain concept used by more than one
module goes in `CONTEXT.md`; an architectural or cross-module decision goes
in `docs/adr/`. See `docs/agents/domain.md`.
