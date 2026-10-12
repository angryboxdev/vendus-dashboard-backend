# Hosting and subprocessors stay in the EU

Task RH (phased), Phase 0, ADR-002 / D1 (hosting part). HR data is personal
data under GDPR; the task requires EU hosting and EU subprocessors (§4.3).

Current state, as verified in the repository on 2026-10-11:

| Component | Provider | Region | Source |
|---|---|---|---|
| API (backend) | Render | Frankfurt (EU) | `render.yaml` |
| Database, auth, file storage | Supabase | **to confirm** | project settings (not in the repo) |
| Frontend | Vercel | static assets + edge; no HR data at rest | — |
| AI document reading | OpenAI | outside the EU unless EU data residency is configured — to confirm | `openai` dependency (supplier invoices only) |

Decided: no HR personal data may go to a non-EU subprocessor. The OpenAI
integration must not receive HR documents or employee data. If a future HR
feature needs AI, it needs an EU-hosted option and a DPO decision first.

## Consequences

- **Open, blocking for go-live (not for Phase 1 development with synthetic
  data):** confirm the Supabase project region (Raul/DPO). If it is not in the
  EU, migrating the project is a prerequisite for real HR data.
- Vercel only serves the built frontend; HR data never rests there.
- Any new subprocessor is added to this table before use.
