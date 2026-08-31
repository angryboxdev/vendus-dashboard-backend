# The scoped query helper is the sole way to build a database query

Settles spec B2's core mechanism (`.scratch/scoped-access/spec.md` D1, D2, D7,
D10). Isolation is enforced by a single helper — an auto-scoping wrapper over
a typed table registry — that cannot be constructed without an organization,
and it is the only thing in `src/**` allowed to hold a database client.

**The helper (D1).** It exposes a table-scoped facade whose verbs return the
native PostgREST builder with the organization already applied: select is
filtered, insert/upsert stamp the organization into the payload, update and
delete are filtered and compose with a later identifier filter rather than
being replaced by it — which is what closes identifier-based cross-tenant
writes. Everything downstream (ordering, ranges, counts, `maybeSingle`) keeps
working unchanged, so a converted call site differs from the original by one
identifier. It knows each table through a registry recording which column
carries the organization and whether the table is location-bearing; a table
absent from the registry is a compile error, not a runtime failure, because
every one of the 58 distinct tables queried in the codebase is named by a
string literal. `organizations` is expressed in the registry rather than
exempted from it — its organization key is its own primary key, so reading
one's own organization row is an ordinary scoped query. The registry is
reused twice more: as the fixture list for the helper's own tests, and as the
table-and-key list the eventual org-claim RLS policies will be written from.

**The alternative rejected: an explicit filter per call site, policed by a
lint rule.** It looked cheaper and was not, on three counts. The diff is no
smaller — it replaces one identifier per site with a hand-written predicate
per site, across the same 371 sites. The lint rule is materially harder to
write correctly: 91 of those sites build their query across several
statements with conditional branches, which a textual check cannot follow
and which an AST rule can only follow with dataflow analysis and false
negatives. And the usual counter-argument for hand-written filters — that
they preserve the client's own generic types, so a scoped wrapper would be
throwing typing away — does not apply here: the Supabase client in this
codebase is untyped, a misspelled table name compiles today, so there is no
type safety a wrapper could be accused of losing.

**The scope is an explicit parameter, not ambient context (D2).** Every
output port method takes the organization as an explicit first parameter.
Adapters receive a helper factory at composition time and build a scoped
helper per invocation; use cases receive the organization in their command
input and pass it down. Per-request composition of the module graph was
rejected: the graph holds process-lifetime objects — the delivery
aggregator's event bus, its session manager, the POS gateway's concurrency
budget — that rebuilding per request would either break or split into two
lifetimes. It is also implicit, which the architecture document already
ruled out on the strength of the cron argument: a scheduled job has no
request, and an explicit parameter is what makes the compiler demand one,
where an ambient mechanism (`AsyncLocalStorage`, a global) would not. Folding
the organization into existing filter or command objects was rejected too:
it makes tenancy an optional-looking field indistinguishable in review from
a business filter, and it reads as "which organization's records do you
want" when the meaning is "you may only see this one."

**The parameter is a branded type (D7).** A nominal string type, constructed
only through a single mint function, living in a new shared kernel folder
that imports nothing else from `src/**`. The hazard is specific: port
methods today take bare strings, and a mechanical edit across 54 ports that
adds another bare string produces methods with two or three adjacent
parameters of the same type, edited by rote — a transposed pair compiles,
runs, and returns nothing forever. The branded type turns that into a
compile error at the call site. The mint function is called in exactly two
places — the auth middleware, from the verified claim, and the unattended
scope (ADR-0009) — which gives a third grep-shaped invariant alongside the
import rule below.

**Enforcement is an import rule, not a naming convention (D10).** The
primary enforcement is a dependency-cruiser rule: the helper's own folder
(`src/infra/scoped-db`) is the only place in `src/**` that may import the
Supabase client or package. A file that cannot obtain a client cannot
construct a query at all, regardless of aliasing, re-export, or a query
assembled across several statements — exactly the class of case the rejected
lint alternative could not handle. It also covers the object-storage and
auth-admin surfaces, which a search for `.from(` never did. Exactly one
operation is exempt from going through the helper: the auth middleware's
membership lookup, which reads a user's membership before an organization is
known. It is a named function, not a general unscoped query surface — adding
another means editing the infrastructure folder and naming what is being
done. One file is exempt from the import rule itself, by name rather than by
folder: the organization provisioning job, which creates the organization
that would scope it and is reachable only from a package script (spec B1's
D7 — the exception is not in the same building as the request path). The
other two standalone jobs write tenant data and go through the helper like
everything else.

## Consequences

The rule shipped at `warn` (`.scratch/scoped-access/issues/01-*.md`), because
it reported hundreds of violations on the day it was added — the 371 sites
not yet converted. It was promoted to `error` in ticket 20, at a verified
zero violations: `npx depcruise src --config .dependency-cruiser.cjs` reports
"no dependency violations found (677 modules, 2502 dependencies cruised)"
with the rule at `error` severity and exit code 0.

This is what makes ADR-0007's deferral of RLS cheap: the guarantee that the
helper is the sole construction site is no longer something a re-audit has
to re-establish by grepping 371 call sites — it is something the build
refuses to violate. ADR-0007's Consequences section is amended to point
here.

The registry is now the table-and-key list the eventual RLS policy author
needs, and the helper's own unit tests are the only new test seam this spec
introduces (`.scratch/scoped-access/spec.md`, Testing Decisions).

Related: `docs/adr/0007` (the boundary this helper enforces, and its
amendment), `docs/adr/0009` (the location decision the same registry
carries), `docs/MULTI_TENANCY_SAAS_DESIGN.md` §2.5, §2.6;
`.scratch/scoped-access/spec.md` D1, D2, D7, D10, D11.
