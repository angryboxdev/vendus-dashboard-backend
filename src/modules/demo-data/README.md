# Module: demo-data

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Gera dados **fictícios** de RH (organizações, centros, funcionários, horários
e marcações de ponto) para a organização de demonstração do "Novo RH" — para
testar e mostrar o sistema sem tocar em dados reais (RGPD, task RH §4.3).

**The problem it solves:**
Sem dados de teste realistas não se prova a assiduidade (meia-noite, mudança
de hora, PT vs ES) nem se mostra o produto sem expor colaboradores reais.

**The flow from the business's point of view:**

```
Equipa técnica                        Quem testa / demonstra
──────────────────────               ──────────────────────
Admin no Novo RH                      Quem testa / demonstra
1. "Criar organização de demonstração"
2. Escolhe "Demonstração"          →  3. Vê e altera centros, colaboradores,
                                          horários e marcações fictícias
   Escolhe "Real"                  →  4. A organização fictícia não aparece
```

**Key concepts for the business:**

- **Organização de demonstração** — organização separada da real, só com dados fictícios; nunca recebe dados reais.
- **Semente** — número que fixa o conjunto: a mesma semente gera sempre os mesmos dados.

---

## Technical purpose

Gerador determinístico e puro (`generateDemoDataset`) com dois destinos:
um ficheiro JSON local (CLI, `.demo/`, fora do git) e a **organização de
demonstração** na mesma base de dados (ADR-0034) — `organizations.is_demo`,
ligada à real por `demo_of`, sem membros. Com `X-Novo-RH-Mode: demo`, os
pedidos `/api/novo-rh/*` de um Admin da organização real passam a agir nela.

## Domain concepts

- `DemoDataset` — 2 organizações, 4 centros (PT `Europe/Lisbon`, ES `Europe/Madrid`), cargos, horários-modelo (incl. noturno e fecho depois da meia-noite), funcionários e marcações em UTC com o fuso do centro e `workDate` (dia de início do turno).
- Invariantes: tudo `synthetic: true`; e-mails `@demo.invalid` (RFC 6761); sem NIF/NISS/IBAN/morada; `clientEventId` único por marcação.
- **Sem valores legais** (feriados, limites, férias) — são configuração com `a_validar = true` (task RH §4.5). Na organização de demonstração os feriados nacionais de PT entram como `to_confirm`.
- `DemoOrg` — organização de demonstração (`id`, `name`); no máximo uma por organização real.

## Ports

### Input (use cases)

- `GenerateDemoDatasetPort` — valida as opções, gera e entrega ao destino; devolve um resumo.
- `DemoOrgUseCases` — `status`, `resolve` (cache 60 s, para o middleware) e `create` (só Admin; uma por organização real; 5 colaboradores por centro, marcações das últimas 4 semanas até ontem; audita `demo.organization.create` na organização real).

### Output (domain dependencies)

- `DemoDatasetSinkPort` — recebe o conjunto e devolve onde ficou.
- `DemoOrgRepositoryPort` — ler a organização, encontrar/criar a demo ligada.
- `DemoSeedPort` — gravar o conjunto na demo (recusa se a organização não for `is_demo`).
- `DemoOrgSupportPort` — data de hoje no fuso da organização e auditoria.

## Adapters

### Input

- `demo-data.cli.ts` → `npm run demo:generate -- --seed 42 --per-center 40 --from 2026-10-19 --to 2026-11-01 --out .demo/dataset.json`.
- `demo-org.controller.ts` → `GET/POST /api/novo-rh/demo` (`governance.settings`; criar exige Admin e Idempotency-Key). Sempre na organização real.
- `demo-context.middleware.ts` → troca `req.auth.orgId` para a demo em `/api/novo-rh/*` com `X-Novo-RH-Mode: demo`; 403 `demo_admin_only` se não for Admin; 409 `demo_not_created`. Montado depois de `requireMfa`.

### Output

- `JsonFileDemoDatasetSink` → ficheiro JSON local.
- `SupabaseDemoOrgRepository` (via `infra/scoped-db/demo-organization.ts`, não-scoped só para `organizations`) e `SupabaseDemoSeeder` (ScopedQuery da demo; linhas montadas por `buildSeedPlan`, puro).

## Design decisions (ADR summary)

- O período por defeito atravessa a mudança de hora de 25/10/2026 (TK-12).
- Organização de demonstração na mesma base de dados, sem membros, só visível no Novo RH em modo Demonstração; crons excluem-na — ADR-0034 (substitui, neste ponto, o ADR-0021).
- Um horário por modelo (os dois "tenants" do gerador partilham os modelos); um calendário de feriados PT atribuído aos centros PT.

## How to test

- Domain/use cases e HTTP (fakes): `npx jest --config jest.config.cjs src/modules/demo-data`.
- As linhas do seed foram validadas contra todas as migrações num Postgres 17 (PGlite) antes do commit.

## Known gaps / open debt

- "Recomeçar" a demonstração não existe (marcações/auditoria são append-only).
- Em demonstração o separador Acessos não mostra utilizadores (são contas reais).
- Ausências, correções e banco de horas ainda não são gerados (entram com as fases 4–6).
