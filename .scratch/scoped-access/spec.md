# Spec B2 — Scoped access

> Status: ready-for-agent
> Última atualização: 2026-08-26
> Architecture reference: `docs/MULTI_TENANCY_SAAS_DESIGN.md` (§2.5, §2.6, §5.1)
> ADRs: `docs/adr/0007` (app-level scoping is the boundary), `docs/adr/0002`
> (location is first-class), plus `0008` and `0009` written by this spec
> Predecessor: `.scratch/tenant-identity/` (spec B1, merged)
> Escrito em inglês, seguindo o documento de arquitetura.

---

## Problem Statement

Spec B1 gave every authenticated request a verified organization. Nothing reads
it. A user of org A can still read org B's data, because not one repository,
service or query filters by organization — `org_id` reaches the database only
through the column defaults spec A installed, which stamp every write with
Angrybox no matter who made it.

That is the whole of the isolation gap, and it is large:

- **371 query construction sites** build queries directly against a Supabase
  client — 182 in `src/services`, 173 in `src/modules`, 10 in routes, 5 in jobs
  and 1 in the auth middleware. None of them mentions an organization.
- **Every one of them uses a client that bypasses Row Level Security.** ADR-0007
  decided app-level scoping *is* the tenant boundary and that RLS lands later as
  an additive net. So there is nothing behind these 371 sites. Whatever they do
  is the isolation guarantee.
- **The enforcement ADR-0007 relies on does not exist.** `dependency-cruiser` is
  configured but is not a gate: no package script, no automatic run over the
  whole tree, and the agent hook that does run it is scoped to
  `src/modules/<module>`, so it has never seen the 182 sites in the legacy
  service layer.

Spec A's hard gate — **no second `organizations` row until the deferred work
lands** — is what makes this the blocking item rather than a tidiness exercise.
B2 is the spec that ends the window in which "one organization exists" is what
keeps the system safe.

## Solution

**Isolation stops being something each call site remembers and becomes something
the codebase cannot express.**

A scoped query helper is the only thing in `src/**` that may hold a database
client. It cannot be constructed without an organization, and every query it
produces already carries that organization's filter — selects are filtered,
updates and deletes are filtered, inserts are stamped. It knows the schema
through a table registry, so a table it has never heard of is a compile error
rather than an unscoped query.

The organization reaches it as an explicit, typed parameter threaded through
every output port and every legacy service function, sourced from the verified
claim B1 put on the request. Paths with no user — the crons, the kiosk, the till
closing — take it from one named file instead, which is exactly the set of paths
the deferred device-identity spec will later replace.

Enforcement is a single dependency-cruiser rule wired into the build: only the
helper's own folder may import the Supabase client. That is structural rather
than textual — a file that cannot obtain a client cannot write a query, no matter
how the query is spelled or across how many statements it is assembled.

When every call site has moved, the column defaults are dropped. That migration
is the contract step: after it, a write that does not name an organization fails.

### What this spec deliberately is not

It is not RLS, and it does not lift spec A's gate. B2 makes a second
organization *possible*; the remaining gated items still have to land before one
is created. The deferred register below records each of them with its trigger.

## User Stories

1. As a customer of the product, I want my data to be invisible to every other
   customer, so that sharing a database with them is not something I have to
   trust anyone's diligence about.
2. As an organization admin, I want every list I see to contain only my
   organization's records, so that I never learn anything about another business.
3. As an organization admin, I want a record I fetch by identifier to be found
   only if it belongs to my organization, so that guessing an id is not an attack.
4. As an organization admin, I want an update naming another organization's
   record to change nothing, so that a copied identifier cannot corrupt someone
   else's books.
5. As an organization admin, I want a delete naming another organization's record
   to delete nothing, for the same reason.
6. As an organization admin, I want everything I create to be attributed to my
   organization automatically, so that attribution is never something a screen
   can get wrong.
7. As an organization admin, I want reports, totals and dashboards to aggregate
   only my organization's rows, so that a figure I act on is about my business.
8. As an organization admin, I want the same guarantee on data written by
   background jobs as on data I enter myself, so that isolation does not depend on
   who or what performed the write.
9. As a manager, I want to record a stock movement against a specific store, so
   that inventory reflects where goods actually moved.
10. As a manager, I want to schedule a work shift at a specific store, so that a
    rota means something when there is more than one location.
11. As a manager, I want to allocate an invoice line to a store, or to no store
    at all, so that a cost belonging to the whole organization is not falsely
    attributed to one branch.
12. As a manager, I want to be unable to record an operation against a store that
    belongs to another organization, so that a mistyped or copied identifier is
    rejected rather than silently accepted.
13. As a manager, I want the store I select to come from a list of my
    organization's stores, so that I am not asked to know an identifier.
14. As a manager of a single-store organization, I want the store to be implicit
    in the interface, so that multi-tenancy costs me no extra clicks.
15. As an employee at the kiosk, I want clocking in and out to keep working
    exactly as it does today, so that this change is invisible on the floor.
16. As an employee closing the till, I want the closing flow to keep working
    exactly as it does today, so that a 2am shift end is not the moment I meet a
    new screen.
17. As the operator of the product, I want the crons to write into a named
    organization rather than relying on a database default, so that it is
    visible which organization a scheduled job acts for.
18. As the operator of the product, I want the paths that resolve identity from a
    constant to be findable in one place, so that the device-identity work is a
    known, finite diff.
19. As the operator of the product, I want to provision a second organization and
    see that its users cannot reach the first one's data, so that isolation is
    something I have observed rather than something I have been told.
20. As the operator of the product, I want the system to keep working normally
    throughout the migration, so that isolation work does not require a freeze.
21. As a developer, I want it to be impossible to write an unscoped query without
    deliberately editing the infrastructure folder, so that the guarantee does not
    rest on my memory.
22. As a developer, I want a table missing from the registry to fail to compile,
    so that a new migration cannot introduce an unscoped table by omission.
23. As a developer, I want the organization parameter to be a distinct type, so
    that passing an employee identifier where an organization belongs is a type
    error rather than a query that quietly returns nothing.
24. As a developer, I want the helper to apply the organization filter to updates
    and deletes as well as selects, so that the dangerous verbs are not the ones
    relying on discipline.
25. As a developer, I want inserts stamped with the organization by the helper,
    so that attribution is not a field a payload can omit.
26. As a developer, I want a query that reads a row by identifier to still carry
    the organization filter, so that identifier-based access is closed by default.
27. As a developer, I want the one place that legitimately queries without an
    organization to be a named function rather than a general escape hatch, so
    that "unscoped" is a thing someone had to write down.
28. As a developer, I want the rule enforced by an import restriction rather than
    by searching for query syntax, so that a query assembled across several
    statements cannot slip past it.
29. As a developer, I want the rule to run automatically on the path to
    production, so that it is a gate rather than a command someone might run.
30. As a developer, I want the rule to be a warning while the migration is in
    flight and an error once it is finished, so that the build is never
    meaningfully red.
31. As a developer, I want each module and each legacy area to be converted in its
    own reviewable change, so that a mechanical edit across hundreds of sites does
    not review as one wall of diff.
32. As a developer, I want a half-migrated system to keep working, so that the
    conversion can be merged and deployed continuously instead of on a branch.
33. As a developer, I want the smallest, cleanest module converted first, so that
    the pattern the other eighteen copy has been reviewed before they copy it.
34. As a developer, I want the module that exercises the hardest decisions
    converted second, so that a foundational mistake surfaces while the foundation
    is still cheap to change.
35. As a developer, I want the background jobs converted together with the service
    they share, so that the same file is not opened twice.
36. As a developer, I want the legacy service layer scoped without being
    rearchitected, so that a security change and an architecture change are not
    evaluated as one thing.
37. As a developer, I want the implied hexagonal migration order recorded, so that
    the question of which module is next does not have to be settled a third time.
38. As a developer, I want the helper covered by unit tests, so that its filtering
    behaviour is pinned rather than inferred from reading it.
39. As a developer, I want a written two-organization verification, so that the
    end-to-end claim is reproducible by whoever asks next.
40. As a developer, I want the front end to send the store on write requests
    before the database begins requiring it, so that the final migration is not an
    outage.
41. As a developer, I want the deploy order written down, so that the ordering is
    a checklist rather than something remembered on the day.
42. As a developer reading this in a year, I want one place that answers "how does
    a query get its organization", so that the answer is not reconstructed from
    four mechanisms.
43. As a future maintainer, I want the deferred work recorded with its trigger, so
    that provisioning organization number two is a checklist and not a memory.
44. As a future maintainer, I want the eventual RLS work to inherit a list of
    tables and their organization keys, so that writing the policies is
    transcription rather than a fresh audit.

## Implementation Decisions

### D1 — The scoped query helper is an auto-scoping wrapper over a typed registry

The helper exposes a table-scoped facade whose verbs return the **native**
PostgREST builder with the organization already applied. Everything downstream —
ordering, ranges, counts, additional filters, `maybeSingle` — keeps working
unchanged, so a converted call site differs from the original by one identifier.

- **select** returns a builder already filtered by the organization.
- **insert** and **upsert** stamp the organization into the payload.
- **update** and **delete** return builders already filtered by the organization,
  so a subsequent filter on an identifier composes with it rather than replacing
  it. This is what closes identifier-based cross-tenant writes: naming another
  organization's row affects zero rows.

The alternative considered and rejected was leaving each call site to write its
own organization filter, policed by a lint rule. It was rejected on three
grounds. The diff is not smaller — it replaces one identifier per site with a
hand-written predicate per site, across the same 371 sites. The lint rule is
much harder: **91 sites build their query across several statements with
conditional branches**, which a textual check cannot follow and an AST rule can
only follow with dataflow analysis and false negatives. And the usual argument
for it — preserving the client's own generic types — does not apply, because this
client is untyped: a misspelled table name compiles today.

**The registry.** The helper knows each queried table through a map recording
which column carries the organization and whether the table is location-bearing.
A table absent from the map is a compile error, so a new migration cannot
introduce an unscoped table by omission. Every one of the 58 distinct tables
queried in the codebase is named by a string literal — there are no dynamic table
names — so the registry types cleanly with no escape hatch.

The registry earns its place three times over: it types the call sites, it is the
fixture list for the helper's own tests, and it is the table-and-key list the
eventual org-claim RLS policies are written from.

`organizations` is expressed in the registry rather than exempted from it: its
organization key is its own primary key, so reading one's own organization row is
an ordinary scoped query.

Recorded as **ADR-0008**.

### D2 — The scope travels as an explicit parameter on every output port method

Modules are composed once at process start, with the database client injected
into adapter constructors. A helper that cannot exist without an organization
therefore cannot be built at composition time.

Every output port method gains the organization as an explicit first parameter.
Adapters receive a helper factory at composition time and build a scoped helper
per invocation. Use cases receive the organization in their command input and
pass it down.

Per-request composition of the module graph was rejected. The graph contains
process-lifetime objects — the delivery-aggregator event bus that drives the
kitchen display's event stream, the aggregator session manager, the POS gateway's
concurrency budget — so rebuilding it per request either breaks them or splits
the composition root into two lifetimes. It is also implicit, which §2.5 already
decided against on the strength of the cron argument: a scheduled job has no
request, and an explicit parameter is what makes the compiler demand one. And it
does nothing for the 192 legacy call sites, which are module-level functions
rather than a composed graph, so it would leave two mechanisms for one concern.

Folding the organization into existing filter or command objects was also
rejected: it makes tenancy an optional-looking field indistinguishable in review
from a business filter, and it reads as "which organization's records do you
want" when the meaning is "you may only see this one".

### D3 — B2 enforces organization isolation only; location is a write input

Only five tables carry a location: four event-grain tables where it is `NOT NULL`
and the invoice line allocation where it is nullable.

**Location is not an isolation boundary.** ADR-0002 describes it as operational —
a manager may legitimately see every store in their organization. Filtering reads
by location adds nothing to this spec's claim, roughly doubles the surface under
review, and drags in front-end work (store pickers, report filters) that belongs
to a feature spec.

So: reads are not location-filtered, and location becomes a **required write
input** on those five tables.

**Both families of column default are dropped together** — organization and
location. Dropping only the organization default would leave org B's first cash
closing writing `location_id` pointing at Angrybox's store: a row belonging to one
tenant and referencing another's location. The constraint that makes that
impossible is a composite foreign key, which spec A deferred, so keeping the
location default plants a cross-tenant dangling reference precisely in the window
where nothing catches it. B2 is also the only spec that opens these write sites,
so leaving them half-done means opening them twice.

Recorded as **ADR-0009**.

### D4 — The client supplies the location on authenticated write requests

The location is named by the caller in the request, not resolved server-side.

Server-side resolution — "the organization's active location, refused if there is
more than one" — was considered and rejected. It repeats the shape of B1's
unambiguity rule, which has been unpleasant to live with: it pushes a guessing
problem into an error path that has to be diagnosed later, and it silently
constrains the data model to one row per organization in order to keep the
runtime simple. Naming the value explicitly is the alternative, with validity
enforced structurally rather than by a runtime rule (D5).

The authenticated write endpoints affected are stock movement creation and
update, work shift creation and update, shift attendance, and invoice lines
(where the value stays optional, because a cost belonging to the organization and
to no store is a real state).

### D5 — Cross-organization locations are blocked by a composite foreign key

A client-supplied location is an authorization input. It is validated in the
database, not the application: a uniqueness constraint on the location's
`(organization, id)` pair, and composite foreign keys from each of the five
location-bearing tables.

This is one uniqueness constraint and five foreign keys. What it buys is that
"the caller named another organization's store" stops being something each use
case must remember to check and becomes a foreign key violation — no query, no
call site that can forget, and it holds equally for the cron and kiosk writers,
which never see a request at all.

Validating in a use case was rejected as a per-write round trip plus a rule
living in five or more places, each of which can be written wrong — the same
"only as safe as the newest endpoint" failure mode B1's D3 used to reject
client-supplied organization identity. Validating inside the helper was rejected
because it puts a query inside the helper on every write.

This **pulls part of spec A's deferred item 1 forward**, deliberately and
narrowly: the location foreign keys only. See D16 for why the rest stays.

### D6 — Paths with no user take their scope from one named file

The crons and standalone jobs have no request. They take the organization, and
where needed the location, from a single named module, passed as an ordinary
argument like any other caller's.

B1 already established that the user-less paths continue to resolve identity
through the existing constant and that replacing it is the deferred
device-identity spec's job. What B2 changes is that the constant stops being
**invisible**: today it is a SQL default silently stamping every write; afterwards
it is a named value passed explicitly, and "which paths still rely on it" is one
grep over one file. That is what makes the device-identity spec a precise diff
rather than an archaeology exercise.

Environment variables were rejected — a UUID in the environment is how the global
POS credential became the problem spec C exists to delete. Fanning the crons out
per organization was rejected as spec C's work, which depends on this spec.

**The trigger is recorded, not vague:** spec C follows immediately and deletes
this file.

### D7 — The organization parameter is a branded type

The parameter is a nominal string type, constructible only through a single mint
function, living in a new shared kernel folder alongside nothing else.

The hazard is specific and is the most likely way a mechanical edit across 54
ports introduces a silent bug. Port methods today take bare strings — an employee
identifier, a date, a record identifier. Adding another bare string produces
methods with two or three adjacent parameters of the same type, edited by rote. A
transposed pair compiles, runs, and returns nothing forever. A distinct type
makes that a compile error at the call site.

The mint function is called in exactly two places: the auth middleware, from the
verified claim, and D6's unattended scope. That gives a third grep-shaped
invariant alongside the enforcement rule.

A wrapper object was rejected as ceremony around a field that will never gain a
second one — location is a command field, not a scope, because a manager may see
every store in their organization.

### D8 — The legacy service layer is threaded, not migrated

`src/services` is 41 files, 171 exported functions and 182 query sites, with
effectively no test coverage. Every exported function gains the organization as
its first parameter; route handlers pass the value from the request's auth
payload. No file is rearchitected.

CLAUDE.md requires asking before starting a migration. This is that decision, and
it is no.

- **Threading is not throwaway work.** The "touch it once" argument that
  justified doing the schema pass as a single migration does not transfer. When a
  legacy area is later rewritten as a hexagonal module, the file is replaced
  wholesale and the parameter simply becomes a port argument. There is no double
  cost to avoid.
- **171 untested functions are the wrong place to change two variables at once.**
  If B2 both scopes and rearchitects and a payroll figure comes out wrong, nothing
  identifies which change did it. A threaded parameter reviews line by line; a
  rewrite of untested code is only re-verifiable by hand.
- **§5.1's own test.** "A user of org A provably cannot read org B" is a unit of
  verification. "…and eight areas were rearchitected" is two specs in one coat.

Migrating the highest-risk area only was also rejected: the service role is
removed from every call site by D1 regardless of a module's architecture, so risk
argues for converting HR *carefully*, not for rewriting it in the same pass.

**In exchange**, this spec records the hexagonal migration order its own work
implies, settling a question §6 has now deferred twice. See Further Notes.

### D9 — Unreferenced files are scoped, not deleted

Four service files have no inbound imports, and one route file is not mounted;
together with the service only that route imports, ten query sites sit in code
nothing runs. They are kept, and they are converted along with everything else.

Ten mechanical edits cost less than the alternative. §2.6 observes that escape
hatches get reused, and the first entry in an allowlist is what makes the second
one arguable. A criterion with no exceptions is worth ten edits.

### D10 — One named unscoped function; enforcement is an import rule

Exactly one operation legitimately queries without an organization: the auth
middleware's membership lookup, which reads a user's membership when no
organization is yet known. It is a **named function**, not a general unscoped
query surface. Adding another means editing the infrastructure folder and naming
what is being done — a reviewable act, rather than an ergonomic escape hatch
sitting next to the scoped one.

**The primary enforcement is a dependency rule: the helper's folder is the only
place in `src/**` that may import the database client.** This subsumes ADR-0007's
first two criteria structurally rather than textually. A file that cannot obtain a
client cannot construct a query at all, regardless of aliasing, re-export, or a
chain assembled across statements. It also covers the object-storage and auth-admin
surfaces, which a search for query syntax never did. The textual criteria remain
as cheap secondary checks.

**One file is exempt by name:** the organization provisioning job. It creates the
organization that would scope it, it is reachable only from a package script, and
it is imported by nothing. B1's D7 chose to keep provisioning outside the request
path precisely so the rule governing every call site could stay absolute —
"because the exception is not in the same building". The exemption names that
decision. It is by file, not by folder: the other two jobs write tenant data and
go through the helper.

Recorded in **ADR-0008**, and ADR-0007's Consequences section is amended, since
its criteria as written are now partly superseded.

### D11 — The proof is a two-organization smoke plus unit tests on the helper

The guarantee decomposes into two claims needing different instruments.

*Every call site goes through the helper* is proven **statically** by D10's import
rule, over all 371 sites. A test could only sample this; the rule proves it.

*The helper always applies the organization* is proven by **unit tests on the
helper itself** — that selects, updates and deletes are filtered, that inserts are
stamped, that the organization-as-primary-key case is handled, and that a table
outside the registry is rejected. The PostgREST builder exposes its method, URL
and body before any request is made, so these are ordinary fast tests with no
database.

*The request path mints and threads a real organization end to end* is proven by a
**two-organization smoke against the local stack**, provisioned with the existing
script, written up as a deliverable in the manner of B1's token-hook verification.

The Supabase-backed integration harness is **deferred again**. Spec A placed it
here, "where the scoped query helper creates the seam to test against". It is
declined for a different and better reason: seeding a valid row in 58 tables means
unwinding foreign key chains and not-null constraints across the whole schema,
and the only guarantee it adds over the above is that PostgREST honours its own
query string, which is not the risk. A registry-driven conformance test looping
every table was also considered and judged ceremony over the same assertions.

### D12 — One spec, converted in per-area increments

B2 is not split further. Its done-criterion is dropping the column defaults, and
that migration cannot run until every writer supplies an organization. There is no
intermediate point with a shippable isolation claim — a first half covering the
hexagonal modules would end exactly where B1 ended, with a property nothing can
verify.

The work is broken into one increment per module or legacy area, plus a
foundation increment and two closing ones.

What makes that safe is worth naming: **while the column defaults still exist, a
half-migrated system is fully working.** A converted area passes the organization
explicitly; an unconverted one still receives it from the default. Every increment
is independently mergeable and deployable. The defaults are the scaffold, which is
why removing them is last. This is the same expand-and-contract shape B1 used to
retire the old user table.

### D13 — Order: pilot, then the hardest case, then by size, then legacy

The foundation comes first because nothing else can start.

**The pilot is the smallest clean hexagonal module** — fully authenticated, few
call sites — because the port-signature pattern it establishes is copied eighteen
times afterwards and should be reviewed before it is copied.

**The till-closing module is converted second, deliberately.** It is the only
module exercising every hard decision at once: location-bearing writes, an
unauthenticated public submit route, and a caller with no auth payload. If D4 or
D6 is wrong, that surfaces at the third increment while the foundation is still
cheap to change, rather than after fifteen modules have been built against it.

The remaining hexagonal modules follow in ascending size, then the legacy areas in
ascending size. HR is last: it is both the largest single area and legacy, making
it the worst place to learn the pattern and the best place to apply a settled one.

**The two standalone jobs are converted with the stock area**, because they write
through the same service and splitting them means opening the same file twice.

The front-end increment lands after every endpoint accepts a location and before
the final migration. Then the enforcement rule is promoted from warning to error,
which is only possible at zero violations. Then the migration.

### D14 — The unauthenticated device paths use the unattended scope

The kiosk and the till closing are public routes in the same single front-end
application — there is no separate build and no per-device configuration. A tablet
in the restaurant is a browser on a bookmarked URL. The people using them are
employees, who are rows in a table rather than accounts; the credential is a
four-digit PIN, and for clock-in additionally a daily rotating token.

So the device has **no identity**. The application build does not know which store
it is, there is no user to ask, and an unauthenticated URL cannot be trusted to
carry it. Every honest way to supply a location to these paths — a device token, a
provisioned URL, a value set at setup — *is* the device-identity spec.

Therefore D4 applies to authenticated write endpoints only. These paths take both
organization and location from D6's unattended scope, and both are replaced
together when device identity lands. Under this rule, "which paths resolve
identity from a constant" has exactly one answer: the paths with no user, whether
that is a scheduled job or a kiosk.

This also determines what happens to the PIN lookup, which is currently global
across all employees: it becomes scoped to the unattended organization — correct
by construction while one organization exists, and superseded by device identity
later. The PIN collision hazard itself remains spec A's deferred item and is not
fixed here.

### D15 — A locations endpoint is added, and is this spec's smallest proof

A new organization-scoped endpoint lists the caller's organization's locations.
The front end fetches it to populate the location on write requests, showing a
picker only when there is more than one.

Attaching the list to the existing identity endpoint was rejected: locations are
organization data that a store picker, a report filter and the eventual
organization-in-the-URL routing all want independently of a session, so stapling
them to the identity response means the first feature needing them without a
session refresh adds the real endpoint anyway, leaving two sources.

The stronger reason is that it gives B2 what spec A had in invoice PDFs and B1 had
in user administration: **a new read that travels the whole path** — request,
verified claim, use case, helper, database — and provably returns one
organization's rows and not another's. It is required work rather than a
demonstration built for the occasion, and it lands in the foundation increment so
the pattern is exercised once before nineteen areas copy it.

### D16 — Only the location composite keys come forward

The codebase has 66 foreign key references and 14 embedded selects. An embedded
select is not organization-filtered — it follows a foreign key from an
already-filtered parent — so it leaks only if a cross-organization foreign key
exists in the data. Which is possible: the helper stamps the organization on the
row being written, but the foreign key *values* come from the caller, so a caller
can name another organization's employee or stock item.

That is the same class of hole D5 closes for locations, and it is not closed here.
The principle:

> **B2 closes the hazards B2 creates; pre-existing ones stay behind the gate.**

D4 introduces a *new* caller-supplied foreign key, so D5 closing it is this spec's
own mess. The other 65 have been caller-supplied since long before this spec and
are already covered by spec A's deferred item 1, which lands before organization
number two. B2 does not lift that gate — it makes organization number two
*possible*, and the gate must still be cleared separately. Nothing is safer for
having done this work inside B2 rather than in the gate-clearing spec.

Filtering the embeds instead was rejected as the wrong layer: it patches the read
symptom while the corrupt row is still written.

**The deferred register's reasoning is rewritten.** It currently says
cross-organization divergence is impossible while one organization exists. True,
but not the point: the real reason is that every write endpoint accepting an
identifier is an unvalidated cross-tenant reference, and the composite key is the
only structural fix. The next reader should understand what they are gating.

### D17 — The stored procedure is scoped; object storage moves but is not re-pathed

**The one stored procedure** aggregates stock movements for a set of item
identifiers with no organization predicate, and is executable by anonymous
callers. It gains an organization argument, filters on it, and is exposed through
the helper so callers cannot invoke it unscoped.

This is not an exception to D16. It is in scope by B2's own done-criterion: the
spec claims the helper is the only place a query is built, and a database function
reading a tenant table without an organization predicate is a hole in that claim
regardless of who created it. Under D1's thesis, the unscoped path that exists is
the one that gets copied.

**The eight object-storage sites** move behind a named wrapper in the helper's
folder, because D10's import rule requires it. They are **not** re-pathed. Prefixing
storage paths by organization is not additive: existing objects live at
unprefixed paths, so changing the scheme means migrating stored files or breaking
every existing document URL. That migration is why spec A deferred it, it is a
pre-existing hazard, and D16's principle applies. The wrapper takes an honest
signature now and gains an organization when the prefixing actually happens,
rather than accepting an argument it deliberately ignores.

### D18 — Enforcement runs on the path to production

A package script runs the type check, the test suite and the dependency rules;
the build command runs it, so a violation fails the deploy. The agent hook that
runs the dependency rules today has its scope widened from a single module
directory to the whole source tree.

ADR-0007's criterion names continuous integration. The underlying requirement is
narrower: the rule must run **automatically**, over the **whole tree**, and
**block something**. The deploy already runs the build, so wiring the check there
delivers real enforcement with no new infrastructure. Nothing reaches production
without passing. The honest weakness is that failure surfaces at deploy rather
than at merge; a pull-request workflow is a small, purely additive follow-up that
touches no decision in this spec.

Widening the hook is worth doing but cannot be the guarantee: it fires only when
an agent edits a file, so a human commit or any change in the legacy layer
bypasses it entirely.

**The import rule ships as a warning** — it produces hundreds of violations on day
one — and is **promoted to an error** in the closing increment, at zero
violations. The pre-existing rules stay errors throughout, so the check is
genuinely blocking from the start, just not yet on the rule B2 is in the middle of
satisfying.

### D19 — Two new ADRs, one amended, and the architecture document updated

- **ADR-0008 — The scoped query helper.** D1, D2, D7, D10.
- **ADR-0009 — Location is a caller-supplied write input, not an isolation
  boundary.** D3, D4, D5, D14.
- **ADR-0007 is amended**, not superseded: the decision stands, but its three
  stated criteria are now partly wrong. The search-for-query-syntax criterion is
  demoted to a secondary check by D10, and the continuous-integration criterion is
  answered by D18's build gate. Stale criteria are worse than none.
- **`docs/MULTI_TENANCY_SAAS_DESIGN.md`**: the status header, §2.6's claim about
  the dependency lint (already flagged as wrong by B1), §5.1's row for this spec,
  and the deferred register's reasoning per D16.
- **Module READMEs** are updated inside each increment, since every output port
  signature changes. CLAUDE.md already requires this; saying it once here avoids
  relitigating it nineteen times.

The two ADRs are kept separate because their lifetimes differ. The helper is close
to permanent; "the caller supplies the location" is explicitly provisional, and
both the device-identity spec and the location-filter feature will revisit it.
Bundling them means a later spec supersedes an ADR that is half still true.

## Testing Decisions

### What makes a good test here

The standard inherited from B1 holds: a good test pins **external behaviour** —
what a caller observes — and uses fakes for output ports rather than reaching a
database or the network. The prior art is the reference module's use case tests
and the auth middleware tests B1 added: construct the unit with hand-written
fakes, exercise it, assert on what comes back.

The caveat inherited from spec A's D11 also still holds, and matters more here
than anywhere: **the existing suite structurally cannot detect schema breakage.**
Every test file uses fakes, none constructs a database client, and the client is
untyped. Green tests after the final migration are evidence that nothing else
moved, not that the migration is correct.

### Seams

Deliberately **one new seam**, matching B1's discipline.

1. **The helper (new seam, unit tests).** The only new unit in the spec, and the
   one every guarantee rests on. Its assertions are on the query it produces —
   method, filters, body — which the builder exposes before any request is made.

   This is closer to testing implementation than the repo's usual standard, and
   that is a deliberate judgement rather than an oversight: for a security
   boundary the emitted predicate genuinely *is* the helper's external behaviour,
   because its caller is the database. It is recorded here so a future reader does
   not mistake it for drift.

2. **The existing use case seams (unchanged).** Every converted module keeps its
   existing tests. The organization parameter threads through fakes exactly as any
   other argument does, so the conversion is visible in the tests without new
   infrastructure.

3. **Two-organization verification (smoke, written up).** The end-to-end claim,
   against the local stack, using the existing provisioning script. A deliverable
   document, in the manner of B1's token-hook verification, rather than an
   automated suite.

Deliberately **not** built: the Supabase-backed integration harness (D11), and a
generated per-table conformance suite.

### Cases that must be covered

At the helper seam:

- a select carries the organization filter;
- an update carries it, and composes with a filter on an identifier rather than
  replacing it;
- a delete carries it;
- an insert body is stamped with it;
- a table whose organization key is its own primary key is filtered on that key;
- a table absent from the registry is rejected.

At the converted-module seams:

- each module's existing use case tests continue to pass with the organization
  threaded through;
- no test constructs a database client.

At the smoke level:

- a second organization is provisioned on the local stack;
- a user of each organization sees only their own records in listings;
- fetching, updating and deleting by an identifier belonging to the other
  organization behaves as not found;
- a write naming a location belonging to the other organization is rejected by the
  database;
- the kiosk and till-closing flows behave exactly as before;
- both crons write into the organization named by the unattended scope;
- after the final migration, a write that names no organization fails.

## Out of Scope

Everything here is recorded with a trigger in the deferred register below.

- **Row Level Security policies and the credential change** that would make them
  run. Deferred per ADR-0007.
- **Device identity** for the kiosk, the kitchen display, the delivery-aggregator
  webhook and event stream, and the crons. They continue to resolve through the
  unattended scope.
- **The kiosk PIN collision fix.** The lookup becomes organization-scoped; the
  four-digit collision hazard across organizations is spec A's deferred item.
- **The other 65 composite foreign keys, the CRM text primary keys, and the
  composite indexes.** Spec A's deferred items 1, 2 and 4.
- **Object-storage path prefixing.** Spec A's deferred item 6.
- **The role taxonomy.** Carried over unchanged from B1's D6.
- **Location as a read filter**, store pickers in reports, and multi-store
  reporting generally.
- **Hexagonal migration of any legacy area.** Threading only, per D8.
- **Per-organization credentials and per-organization cron fan-out.** Spec C.
- **Seed template data, billing, plans, subdomains, white-label branding.**

## Further Notes

### Deferred register

Nothing below is lost work. Each row carries a trigger rather than a vague
"later". The first group shares spec A's standing gate: **no second
`organizations` row in production until they land.**

| Deferred | Why it can wait | Trigger |
|---|---|---|
| Org-claim RLS policies and the credential switch | Additive per ADR-0007; policies are per-table, so tables tighten one at a time. B2 delivers the precondition that made deferral cheap — the helper as sole construction site — and the registry hands the policy author the table-and-key list | before org #2 |
| Device identity for the paths with no user — kiosk, kitchen display, aggregator webhook and stream, cron organization | With one organization every device already belongs to it. Two of these paths have no authentication at all today, so this is a pre-existing hole, currently contained. D6 makes the diff finite: one file names every consumer | before org #2 |
| Kiosk PIN collision across organizations | A four-digit PIN is a 10,000-value space; with two organizations a collision lets an employee verify against another tenant's employee. Contained while one organization exists. Carries a front-end contract change | before org #2 |
| The other 65 composite foreign keys | Every write endpoint accepting an identifier is an unvalidated cross-tenant reference, and the composite key is the only structural fix. Impossible to exploit while one organization exists. **This is the reason, replacing the register's current "divergence is impossible" wording** | before org #2 |
| Composite `(org_id, …)` indexes | Query plans do not degrade while every row shares one organization | before org #2 |
| CRM text primary keys | Human-assigned identifiers collide across tenants on the first row | before org #2 |
| Object-storage path prefixing | Not additive: existing objects live at unprefixed paths, so it needs a file migration or it breaks every existing document URL | before org #2 |
| Seed template data at provisioning | Angrybox is already seeded; the need appears with the first new organization | before org #2 |
| Per-organization credentials; crons fan out per organization | Spec C, which depends on this spec. **It deletes D6's unattended scope file**, which is the trigger recorded there | immediately after B2 |
| Location as a read filter; store pickers in reports | Operational, not isolation. The write path and the locations endpoint land here, so the feature is additive on top | first multi-location organization |
| Multi-organization login and organization switching, expected to be URL-based | Inherited unchanged from B1's register | first genuinely multi-organization person |
| Role taxonomy rework | Orthogonal to scoping, per ADR-0003 | when a second customer's access needs are known |
| Pull-request workflow running the same checks as the build | D18's build gate already blocks production; a workflow moves the signal earlier and touches no decision here | whenever wanted; purely additive |
| Hexagonal migration of the legacy areas | D8 threads without rewriting. The implied order is recorded below | as each area next needs substantial change |

### Two pre-existing gaps, recorded and not fixed

Both concern the unauthenticated device paths and predate this spec:

- The till-closing submit has **no rate limit**, where the clock-in scan is
  limited per address.
- The till-closing submit has **one factor** (the employee PIN), where clock-in
  has two (PIN plus a daily rotating token).

They belong with device identity, and are written down here so that spec inherits
them rather than rediscovering them.

### The implied hexagonal migration order

§6 has now twice deferred the question of which module is touched in what order,
most recently concluding it "belongs to phase 5" — that is, here. B2 does not
migrate anything (D8), but its conversion order reveals the answer, and recording
it settles the question rather than deferring it a third time.

The legacy areas, in the order B2 converts them, are also the order in which they
should become hexagonal modules: smallest and most self-contained first
(analytics, preparations), then the reporting and import areas, then the product
and CRM areas, then stock, then HR. HR is last for the same reason it is last
here: it is the largest, it holds the most sensitive data, and it should be
migrated by someone applying a pattern rather than inventing one.

### Cross-repository contract

CLAUDE.md requires the two repositories to stay in contract sync within the same
task. B2 changes the contract in two ways, both additive on the back end:

- a new endpoint listing the caller's organization's locations (D15);
- a location on the payload of the authenticated write endpoints listed in D4 —
  required for stock movements and work shifts and attendance, optional for
  invoice lines.

**Deploy order, and the reason for it.** The back end accepts the location before
it requires it: every write endpoint is converted first, tolerating a missing
location while the column defaults still stand. The front end then ships, sending
it. Only afterwards can the final migration drop the defaults, at which point a
write without a location fails.

Getting this backwards makes the final migration an outage on every stock, shift
and attendance write. This is the same shape as B1's D9, and as B1 concluded when
its issues were broken out, it makes the front end a **blocking increment** rather
than a footnote.

### A correction to the counts in circulation

ADR-0007 and spec B1 both cite "406 `.from(` call sites", and an earlier draft of
this spec said 428. Both figures are inflated: a plain search for `.from(` also
matches `Array.from` and `Buffer.from`, which are numerous in the analytics and
delivery-aggregator code. Excluding those, the real number of database query
construction sites is **371** — 182 in the legacy service layer, 173 across the
hexagonal modules, 10 in routes, 5 in jobs and 1 in the auth middleware.

This does not change any decision; it is corrected so that the closing
increment's "zero remaining" check is measured against an honest baseline, and so
that a future reader is not puzzled by a discrepancy of 35.

### Increments

| # | Title | Blocked by |
|---|---|---|
| 01 | Foundation: branded organization type, scoped helper and registry, unscoped door, import rule as warning, check script in build, locations endpoint | — |
| 02 | Convert `bank-accounts` (pilot — establishes the pattern) | 01 |
| 03 | Convert `cash-closings` (validates the location and unattended-scope decisions early) | 02 |
| 04 | Convert `vendus` | 02 |
| 05 | Convert `payable-entries` | 02 |
| 06 | Convert `payable-recurrences` | 02 |
| 07 | Convert `crm` module | 02 |
| 08 | Convert `financial-base` | 02 |
| 09 | Convert `bank-statements` | 02 |
| 10 | Convert `invoices` | 02 |
| 11 | Convert analytics services | 03 |
| 12 | Convert preparations services | 03 |
| 13 | Convert DRE and documents services | 03 |
| 14 | Convert supplier invoice import services | 03 |
| 15 | Convert pizza services | 03 |
| 16 | Convert CRM services | 03 |
| 17 | Convert stock services and the two standalone jobs | 03 |
| 18 | Convert HR services (employees, shifts, attendance, leave, audit, kiosk) | 03 |
| 19 | Front end: consume the locations endpoint, send location on write payloads | 10, 17, 18 |
| 20 | Promote the import rule to an error; write the ADRs; update the architecture document | 04–18 |
| 21 | Migration: drop both default families, add the location composite keys; two-organization smoke; deploy runbook | 19, 20 |

Two notes on the ordering, both settled while breaking the increments out:

- **The pilot blocks everything, but the rest do not block each other.** Increments
  04 through 10 are independent once the pattern exists, and 11 through 18 are
  independent once 03 has validated the location and unattended-scope decisions.
  They are numbered by size so that if they are done in order the risk profile
  rises gradually, not because each waits on the last.
- **The front end is a blocking increment, not a footnote.** It must precede the
  final migration, and the risk table calls that the one failure users would
  notice.

### Risks

| Risk | Mitigation |
|---|---|
| The final migration runs before the front end sends a location, and every stock, shift and attendance write fails | The deploy order above; increment 19 blocks increment 21, and the back end accepts the location long before it requires it |
| A module is converted but a query is missed, leaving an unguarded read | D10's import rule makes it structurally impossible rather than a matter of review: a file that cannot import a client cannot build a query |
| The import rule is added as a warning and never promoted | Increment 20 exists solely to promote it, and blocks the final migration |
| Threading an organization into methods of bare-string parameters transposes two arguments and silently returns nothing | D7's branded type makes a transposition a compile error |
| A caller names another organization's location and it is accepted | D5's composite foreign keys reject it in the database, on every path including the crons |
| Green tests are mistaken for evidence the final migration is correct | Restated from spec A's D11 in Testing Decisions; the migration is verified against the local stack, not by the suite |
| The unattended scope becomes permanent | D6 records spec C as its trigger, and spec C follows immediately |
| The deferred register is forgotten and organization #2 is provisioned against a partly guarded system | The register above carries spec A's standing gate; the provisioning script is the natural place to make that gate visible |
| B2's size makes it stall half-finished | D12's scaffold property: every increment is independently mergeable and deployable, and the system works throughout |
