# Location is a caller-supplied write input, not an isolation boundary

Settles spec B2's location decisions (`.scratch/scoped-access/spec.md` D3, D4,
D5, D14). Only five tables carry a location: four event-grain tables where it
is `NOT NULL`, and the invoice line allocation where it is nullable. This ADR
covers those five tables only, and is explicitly **provisional** — see
Consequences.

**Location is not an isolation boundary (D3).** ADR-0002 already describes it
as operational: a manager may legitimately see every store in their
organization. Filtering reads by location would add nothing to spec B2's
isolation claim, roughly double the surface under review, and drag in
front-end work (store pickers, report filters) that belongs to a feature
spec instead. So: reads stay unfiltered by location, and location becomes a
**required write input** on the five location-bearing tables (optional on
the one allocation table, where a cost belonging to the organization and to
no store is a real state, not missing data).

Both families of column default — organization and location — are dropped
together, in the same migration. Dropping only the organization default
would let a second organization's first cash closing write `location_id`
pointing at Angrybox's store: a row belonging to one tenant and referencing
another's location. The constraint that would catch that is a composite
foreign key, which spec A deferred; keeping the location default while
dropping the organization one plants a cross-tenant dangling reference in
exactly the window where nothing catches it. Spec B2 is also the only spec
that opens these five write sites, so leaving them half-done means opening
them twice.

**The client names the location; the server does not resolve it (D4).**
Server-side resolution — "the organization's active location, refused if
there is more than one" — was considered and rejected. It repeats the shape
of spec B1's unambiguity rule for organization identity, which was
unpleasant to live with in practice: it pushes a guessing problem into an
error path that has to be diagnosed later, and it silently constrains the
data model to one row per organization to keep the runtime simple. The
authenticated write endpoints affected are stock movement creation and
update, work shift creation and update, shift attendance, and invoice lines
(optional there).

**A caller-supplied location is validated in the database, not the
application (D5).** A uniqueness constraint on the location's `(organization,
id)` pair, plus a composite foreign key from each of the five
location-bearing tables, turn "the caller named another organization's
store" into a foreign key violation rather than a check every use case must
remember to run — and it holds equally for the cron and kiosk writers, which
never see a request at all. Validating in a use case was rejected: a
per-write round trip, and a rule living in five or more places, each of
which can be written wrong — the same "only as safe as the newest endpoint"
failure mode spec B1's D3 rejected for organization identity. Validating
inside the helper was rejected because it would put a query inside the
helper on every write. This pulls part of spec A's deferred
composite-foreign-key item forward, deliberately and narrowly: the location
foreign keys only (see ADR-0005's Consequences, and spec B2's D16 for why
the other 65 pre-existing foreign key references stay behind the gate).

**The unauthenticated device paths have no identity to ask (D14).** The
kiosk and the till closing are public routes in the same single front-end
application; there is no separate build and no per-device configuration. A
tablet in the restaurant is a browser on a bookmarked URL, used by employees
who are rows in a table, not accounts — the credential is a four-digit PIN,
plus for clock-in a daily rotating token. So the device has no identity: the
build does not know which store it is, there is no user to ask, and an
unauthenticated URL cannot be trusted to carry it. Every honest way to give
these paths a location — a device token, a provisioned URL, a value set at
setup — *is* the device-identity spec. So D4 applies to authenticated write
endpoints only; the kiosk and till-closing paths take both organization and
location from the single named "unattended scope" file spec B2's foundation
increment introduces, and both are replaced together when device identity
lands. This also determines what happens to the employee PIN lookup, today
global across all employees: it becomes scoped to the unattended
organization — correct by construction while one organization exists, and
superseded by device identity later. The PIN collision hazard itself is not
fixed here; it stays spec A's deferred item.

## Consequences

**This decision is provisional, not settled.** Two specs are already
expected to revisit it: the **device-identity spec**, which replaces the
unattended scope file for every path with no user (kiosk, kitchen display,
delivery-aggregator webhook and stream, both crons) and therefore replaces
D14's mechanism outright; and the **location-as-a-read-filter feature**,
deferred in spec B2's register with trigger "first multi-location
organization," which will add the store pickers and report filters D3
deliberately left out. Neither changes the schema decisions here (the
composite foreign keys, `NOT NULL` vs nullable), only how a location reaches
a write and whether reads ever filter by it.

Kept as a separate ADR from ADR-0008 on purpose: the helper is close to
permanent, this is not. Bundling the two would mean a later spec supersedes
an ADR that is half still true, which is how ADRs rot.

Related: `docs/adr/0002` (location is first-class in v1), `docs/adr/0005`
(`org_id` denormalization and the composite-foreign-key deferral),
`docs/adr/0008` (the helper whose registry marks which tables are
location-bearing); `docs/MULTI_TENANCY_SAAS_DESIGN.md` §2.2;
`.scratch/scoped-access/spec.md` D3, D4, D5, D14, D16.
