# Handoff: spec(s) for the "second organization" gate

## Repo
`/Users/viniciusbazanella/projects/vendus-dashboard-backend` (Backend of the
vendus-dashboard product; frontend is a separate repo — see repo's `CLAUDE.md`
for its path, or `[[frontend-repo-path]]` memory since `CLAUDE.md`'s stated
path is stale).

## What the previous session was doing

Reviewing `docs/MULTI_TENANCY_SAAS_DESIGN.md` (the standing architecture doc
for turning this single-tenant app into multi-tenant SaaS) against the specs
already shipped, to figure out what's left. That doc is the required reading
before anything below — especially §2 (tenancy model), §5/§5.1 (phasing and
spec table), and §6 (open decisions).

**State reached, all recorded in the doc (already edited this session — see
`git diff docs/MULTI_TENANCY_SAAS_DESIGN.md`, uncommitted, not yet asked to
commit):**
- Specs A, B1, B2, C, E are implemented and closed (`.scratch/_done/`).
- Decision 5 (ledger granularity) is still open — a separate research thread
  (Vendus alternatives) is running in another forked session about it; not
  this handoff's concern.
- Decision 7 (channel economic attributes) was just settled this session:
  ship `type`/`commission_rate`/`settlement` on `channels`, timed as phase 10.
- Spec D (sales ledger, phases 8-9-10) is designed but not yet spec'd or
  built — separate piece of work, not this handoff's concern either.

**The thing this handoff is actually about**, surfaced when the user asked
"what else is needed to close this subject": spec A deferred six items into
spec B behind an explicit hard gate — *no second `organizations` row until
all six land*. Two are done. **Four (arguably five — see correction below)
are not**, and they are independent of spec D / decisions 5 & 7. They are
arguably more important than spec D, because without them a second tenant is
not actually safe, regardless of what the sales ledger looks like.

The user asked for a `/handoff` to start a fresh session that writes spec(s)
for these.

## Correction to how this was described mid-conversation

Talking to the user, I compressed the remaining work into "4 hard gate items"
(composite indexes, CRM PKs, kiosk PIN, storage prefixing). That conflates two
genuinely separate items from the original table. **Read the primary sources
below, not this paragraph, for the real shape** — but the accurate count is:

- 1 item already fully done (dropping `org_id`/`location_id` column defaults —
  ticket 21).
- 1 item **partially** done (composite foreign keys — B2 pulled forward only
  the 5 *location* ones it introduced itself; ADR-0009, spec B2's D16).
- **5 items still open**, not 4: composite FKs (the ~65 remaining, non-location
  ones), composite indexes (a *separate* item — pure performance, not a
  security fix), CRM primary keys, the kiosk PIN fix, storage path
  org-prefixing.

## Primary sources — read these, don't just trust this summary

1. `docs/MULTI_TENANCY_SAAS_DESIGN.md` §5.1, the paragraph starting "**Spec A
   defers six items into spec B, behind a hard gate**" — the current-state
   framing.
2. `.scratch/_done/org-location-foundation/spec.md` — search for "Deferred to
   spec B" for the original 6-row table (`#`, `Item`, `Why deferred`), and
   `D7`/`D8` for the reasoning behind the kiosk-PIN and CRM-key carve-outs
   specifically (D7 has the exact file:line of the two unscoped kiosk PIN
   lookups; D8 has the online-migration technique — `CREATE UNIQUE INDEX
   CONCURRENTLY` then FK as `NOT VALID` + `VALIDATE CONSTRAINT`).
3. `.scratch/_done/scoped-access/spec.md`, search for "D16" — B2's own audit
   of this gate: **66 total foreign key references** in the codebase (vs. the
   original spec's "~52 relationships" estimate — trust the 66/65 figure,
   it's the more recent audit), of which B2 closed exactly 1 (the location
   one it introduced) and explicitly left 65 behind the gate, plus **14
   embedded `select` queries** that are safe only *because* no cross-org
   foreign key can exist yet — closing the composite FKs is what makes those
   embeds safe too, not a separate deliverable. D16 states the governing
   principle: *"B2 closes the hazards B2 creates; pre-existing ones stay
   behind the gate."*
4. `docs/adr/0009-location-is-a-caller-supplied-write-input.md` — the worked
   example (location composite FKs) to replicate for the other 65.

## The items to spec, one by one

1. **Composite FKs `(org_id, id)`** on the ~65 remaining pre-existing FK
   references. This is the real security fix — today any write endpoint
   taking an id (employee id, stock item id, etc.) accepts a cross-org
   reference with nothing to reject it. Online technique already proven by
   ADR-0009/spec B2: unique index concurrently, then FK `NOT VALID` +
   `VALIDATE CONSTRAINT`. Biggest item by volume; probably wants its own
   audit pass first (which of the 65 are highest-risk / most user-facing).

2. **Composite `(org_id, …)` indexes.** A distinct, lower-stakes item — pure
   query-planner performance, useless with one org, cheap with two.
   `CREATE INDEX CONCURRENTLY` cannot run inside a transaction and the
   Supabase CLI wraps migrations in one — needs its own migration with the
   transaction disabled, or a deliberate manual run.

3. **CRM primary key restructuring.** `crm_customers.id` (`'C001'`, ...),
   `crm_parameters.key`, `crm_scripts.code`, `crm_tags.name` collide the
   moment a second org's first customer is created. Depends on item 1
   landing first — the children (`crm_contacts`, `crm_orders`,
   `crm_customer_tags`) need composite FKs to follow along. Flagged in the
   original spec as *"the item most likely to be forgotten, because unlike
   the others it fails loudly at onboarding rather than silently"* — i.e. it
   won't show up in a security audit, it'll show up as a crash the day org #2
   signs up.

4. **Kiosk PIN fix.** `hr_employees.kiosk_pin_hash` has a global unique
   index; two lookups (cited with file:line in org-location-foundation's D7)
   have no org filter. Needs the kiosk's QR payload to carry an org/location,
   the index to become `(org_id, kiosk_pin_hash)`, and the lookup to filter
   by it. **The only one of these with a frontend contract change** — per
   this repo's `CLAUDE.md`, that means touching the frontend repo in the same
   task, not just this backend.

5. **Storage path org-prefixing.** HR documents and invoice PDFs aren't
   stored under an org-scoped path. Explicitly paired with the
   `storage.objects` RLS policies from §2.6 point 3 of the design doc — that
   policy design didn't happen yet either (decision 3 / ADR-0007 settled that
   RLS in general is deferred as an *additive net*, not the primary boundary;
   check whether storage-specific policies are meant to land on the same
   timeline or are a narrower exception — the design doc doesn't fully spell
   this out, worth resolving while scoping this item).

## Suggested skills

- This repo carries its own spec/ticket-writing skills under `.agents/skills/`
  (symlinked into `.claude/skills/`): **`to-spec`** and **`to-tickets`** look
  purpose-built for turning this handoff into an actual spec + issue
  breakdown, matching the format of `.scratch/_done/scoped-access/spec.md`
  (which is the closest precedent — same "hard gate," same kind of
  mechanical-but-security-sensitive work). Check these are still registered
  and use them if so, rather than freehanding the spec format.
- `docs/agents/issue-tracker.md` for this repo's actual issue-tracker
  conventions (`.scratch/<feature-slug>/`) if the skills above don't cover it.
- Given item 3 needs frontend coordination, re-read the frontend repo's own
  `CLAUDE.md` before touching it, per this repo's `CLAUDE.md` §"Repositories".
- `domain-modeling-repo` if scoping surfaces a domain concept worth recording
  beyond what an ADR/README already captures.
- The user's global preference (their own `CLAUDE.md`): run codebase
  exploration and heavy multi-step work through sub-agents, keep the main
  session as orchestrator; ask before `git commit`.

## Open question worth raising with the user before writing the spec

Should this be **one spec** (mirroring "A and B are split... different
review posture" reasoning in §5.1) or **split**, e.g.: a mechanical
migrations spec (items 1-2), a CRM-key spec that depends on it (item 3), a
frontend-touching spec (item 4), and a storage-policy spec (item 5)? The
design doc's own convention is "a spec is a unit of *verification*" — worth
applying that test here rather than defaulting to "one spec per deferred
list."
