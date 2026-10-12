# Module: org-structure

> Status: active
> Last updated: 2026-10-11

---

## What it is and what it's for (business perspective)

A estrutura da empresa no Novo RH para além dos locais: **departamentos**,
**grupos** (com subgrupos), a que departamentos/grupos cada colaborador
pertence e desde quando, os **contactos por função** da empresa e o registo
de **aceitação dos termos e do DPA**.

**The problem it solves:**
As regras (motor de configurações), as permissões por âmbito e os relatórios
precisam de saber "quem pertence a quê, em que data" — sem isso só há o
local de trabalho.

**Key concepts for the business:**

- **Departamento** — área funcional comum a todos os centros (ex.: Cozinha, Sala).
- **Grupo** — agrupamento livre, hierárquico (ex.: Equipa A → Turno noite), com código e cor.
- **Pertença** — colaborador ↔ departamento/grupo com data de início e fim.
- **Contactos por função** — principal, faturação, comunicações, técnico, onboarding (não são utilizadores).

---

## Technical purpose

CRUD sem apagar (arquivar), com validação, auditoria de cada escrita e
pertenças com vigência. Os centros continuam no módulo `locations`.
Fornece `unitsOf`/`membersOf` ao motor de configurações.

## Domain concepts

- Invariantes: nome de departamento único entre os não arquivados; código de grupo único; cor `#RRGGBB`; descrição ≤ 250; grupo sem ciclos (aplicação + trigger); não arquivar grupo com subgrupos ativos; pertenças à mesma unidade sem sobreposição; só encurtar a vigência; unidade arquivada deixa de contar.
- Pertença só direta: estar num subgrupo **não** conta como estar no grupo-pai (decisão segura; revisitar com RH).

## Ports

### Input (use cases)

- `OrgStructurePorts` — departamentos, grupos, pertenças, contactos, termos, `unitsOf`, `membersOf`.

### Output (domain dependencies)

- `OrgStructureRepositoryPort`, `OrgStructureAuditPort` (módulo audit), `RequestIpPort`.

## Adapters

### Input

- `OrgStructureController` → `/api/novo-rh/structure/{departments,groups,assignments,contacts,terms}` (permissão `company.structure`; Idempotency-Key; If-Match nas alterações de departamento/grupo — cada item da lista traz o seu `etag`).

### Output

- `SupabaseOrgStructureRepository` — `org_departments`, `org_groups`, `employee_org_assignments`, `org_contacts`, `org_terms_acceptances` (migração `20261012120000`).

## Design decisions (ADR summary)

- Raio da zona dos centros 10–1000 m como CHECK `not valid`: vale para linhas novas/alteradas sem falhar nas existentes.
- Aceitação de termos append-only; o rollback não a apaga (registo legal).

## How to test

- `npx jest --config jest.config.cjs src/modules/org-structure`.

## Known gaps / open debt

- Várias entidades legais por organização (C3.2) fora da Fase 1.
- Sem endpoint para mover pertenças em massa.
