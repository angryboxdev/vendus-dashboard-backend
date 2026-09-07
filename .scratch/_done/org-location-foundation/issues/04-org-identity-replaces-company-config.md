# 04 — Org identity replaces `config/company.ts`

Status: open
Blocked by: 03
Spec: `../spec.md` (D10)

## Problem

`src/config/company.ts` hardcodes the legal identity of one business. It also
resolves a contradiction in the design doc: phase 1 says org identity replaces
it, phase 6 and spec C say it is deleted there. Spec A wins — without a real
reader, the `organizations` row is inert data whose only acceptance criterion is
"it exists", and a typo in the NIF would sit undetected until spec C.

`COMPANY` has exactly one consumer:
`src/modules/financial-base/adapters/in/financial-base.controller.ts:86-88`,
printing `name`, `nif` and `address` into a PDF header. `email` is never read.

## Work

1. An output port in `financial-base` — `OrganizationIdentityPort` with
   `findById(orgId): Promise<OrganizationIdentity | null>` — plus a Supabase
   out-adapter reading `organizations`.
2. The PDF header reads from it instead of `COMPANY`.
3. A single `DEFAULT_ORG_ID` constant in the module's composition root, holding
   the fixed UUID seeded in issue 03. **One place, named for what it is** — a
   scaffold that spec C deletes when auth supplies the real `orgId`.
4. Delete `src/config/company.ts`.
5. Unit test with a fake for the port.

## Not in scope

Identity is still resolved from a constant `DEFAULT_ORG_ID`, not from the
request. Per-tenant resolution — `orgId` arriving from `req.auth` — is spec C.

The hardcoding does not disappear here, it shrinks: from four literal fields to
one literal org id. This issue proves the `organizations` row is readable and
correctly seeded, nothing more.

That is deliberately cheap to finish later. The port is already
`findById(orgId)`, which is spec C's signature, so spec C changes one line —
where the argument comes from — and deletes a one-line constant. Nothing built
here is rewritten there.

## Notes

- `financial-base` must stay free of restaurant vocabulary (ADR-0001). Org
  identity is money-and-entities vocabulary; it belongs there cleanly.
- The header fields the PDF prints must be unchanged. If they are not, the seed
  in issue 03 does not match what `config/company.ts` said — which is the point
  of doing this in spec A rather than spec C. Note that whole-file comparison
  does not work: the header prints `Gerado em: <today>`
  (`financial-base.controller.ts:99`) and PDFKit stamps a timestamp-granular
  `CreationDate` into the info dictionary, so two renders of the *unchanged*
  code already differ. Compare the extracted text of the three fields.

## Consequence for spec C

Its done-criterion narrows to *"`ENV.API_KEY` deleted, `DEFAULT_ORG_ID` deleted,
crons run per org"*. `config/company.ts` is already gone by then.

## Done when

- [ ] The PDF header reads `name`/`nif`/`address` from the `organizations` row
- [ ] The `name`, `NIF:` and `address` lines extracted from a generated PDF match
      the same three lines extracted before the change — a mismatch means the
      issue 03 seed is wrong, which is what this issue exists to catch
- [ ] Unit test with a fake for the port passes
- [ ] `DEFAULT_ORG_ID` appears in exactly one file
- [ ] `src/config/company.ts` no longer exists (consequence of the above, not the
      goal — see "Not in scope")
