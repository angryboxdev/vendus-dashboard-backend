# `org_id` is denormalized onto every table, not derived through foreign keys

Multi-tenancy needs every row to be attributable to an organization. The
alternative to putting `org_id` on all 51 tables was to keep it only on "root"
tables and derive it for children through the foreign-key chain —
`invoice_lines → invoices → org_id`. Decided: denormalize, one `org_id NOT NULL`
column per table, with `organizations` as the sole exemption (its `id` *is* the
org id).

Derivation is the cleaner model on paper and it was seriously considered. Three
things ruled it out. It is **not expressible** for parts of this schema:
`crm_customer_tags` has two parents and would have to pick one as authoritative,
and once `crm_tags` is org-keyed the child cannot write its foreign key without a
local `org_id` at all; `bank_movement_entity_links` is polymorphic
(`entity_type` + a bare `entity_id`) with no foreign key to derive along. It
**forks every enforcement mechanism**: RLS policies become nested `EXISTS`
subqueries per hop instead of one `org_id = current_org()` template, and the
§2.6 scoped query helper needs a per-table PostgREST embedded-filter mode
instead of a uniform `.eq("org_id", orgId)` — an escape hatch, and escape hatches
get reused. And it **removes tenant pruning from every child index**, so a scan
of `invoice_lines` touches every tenant's rows and filters after joining.

The usual objection to denormalizing — that a copy can drift from its source —
is answered by composite foreign keys, `(org_id, invoice_id) REFERENCES
invoices (org_id, id)`, which make the copy something Postgres proves rather
than something the application maintains.

## Consequences

Every table except `organizations` carries `org_id NOT NULL`. RLS policies and
the scoped query helper stay one shape across the schema, and the acceptance
criterion "no table lacks `org_id`" is a single `information_schema` query rather
than an argument about reachability.

Composite foreign keys do **not** land in spec A. Cross-org stitching requires
two organizations to exist, and throughout spec A there is one — every `org_id`
holds the same value, so divergence is impossible rather than merely unlikely.
They are gated into spec B, which is also the window in which
`VALIDATE CONSTRAINT` is guaranteed to pass on the first run. **No second
organization row may be created before they land.**

Related: `docs/MULTI_TENANCY_SAAS_DESIGN.md` §2.4, §2.6;
`.scratch/org-location-foundation/spec.md` D3, D8.
