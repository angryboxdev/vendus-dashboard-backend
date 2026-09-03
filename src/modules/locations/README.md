# Módulo: locations

> Status: ativo
> Última atualização: 2026-08-26

---

## O que é e para que serve (perspectiva de negócio)

Uma organização pode ter mais do que uma loja/restaurante ("location"). A
aplicação precisa de saber quais são as locations de uma organização para,
por exemplo, deixar um manager escolher em que loja registou um movimento de
stock ou um turno de trabalho.

**O problema que resolve:**
Sem este endpoint, o front end não tem forma de listar as locations do
chamador para preencher um seletor de loja — teria de assumir sempre "a
única loja que existe", o que deixa de ser verdade a partir da segunda
organização.

**O fluxo do ponto de vista do negócio:**

```
Manager (frontend)
────────────────────────────────────────────────────
1. Abre um ecrã de escrita que pede uma loja (ex.: registar stock)
2. Frontend chama GET /api/locations
3. Vê só as lojas da sua própria organização
4. Escolhe uma loja (ou o seletor nem aparece, se só existir uma)
```

**Key concepts for the business:**

- **Location** — uma loja/restaurante físico pertencente a uma organização.
  Tem nome, código e fuso-horário.

---

## Technical purpose

Módulo mínimo — leitura apenas — que prova o caminho ponta-a-ponta da spec B2:
pedido → claim verificada → use case → `ScopedQuery` → base de dados,
devolvendo apenas as locations da organização do chamador (spec.md D15;
ticket `01-foundation-scoped-helper-and-enforcement`). Não cria, edita nem
desactiva locations — isso continua a ser feito pelo script de provisioning
(`runOrganizationProvisioning`, spec B1). Desde a spec E (location-credentials),
também expõe um segundo read — `findOneForOrganization` — usado por esse
módulo para confirmar posse de uma location antes de emitir um pairing code.

## Domain concepts

- **Location** — entidade só de leitura neste módulo: `id`, `name`, `code`,
  `timezone`, `isActive`. Sem invariantes próprias — é reconstituída a partir
  da base de dados, nunca criada aqui (`Location.reconstitute`, sem
  `Location.create`).

## Ports

### Input (use cases)

- `ListLocationsPort` — lista as locations de uma organização; recebe
  `organizationId` (branded `OrganizationId`, `src/kernel/`).

### Output (domain dependencies)

- `LocationRepositoryPort` — `findAllForOrganization(organizationId)`;
  `findOneForOrganization(organizationId, locationId)` — ownership check
  added for `location-credentials` (spec E D11/D19): confirms a location
  belongs to the calling organization before minting a pairing code, without
  re-implementing that check outside this module.

## Adapters

### Input

- `LocationController` → expõe `GET /locations`. Montado depois do
  `requireAuth` global em `server.ts`, sem `requireMinRole` adicional —
  qualquer role autenticado pode listar as locations da sua organização.

### Output

- `SupabaseLocationRepository` → tabela `locations`. Não recebe nem guarda um
  `SupabaseClient` — recebe o factory `createScopedQuery`
  (`ScopedQueryFactory`, `src/infra/scoped-db/`) injectado pelo composition
  root e constrói um `ScopedQuery` por chamada (D2). É por isso que este
  adapter não aparece na lista de violações da regra `supabase-so-no-scoped-db`.

## Design decisions (ADR summary)

### Read scoped pela organização, não pela location

O endpoint devolve todas as locations da organização do chamador — não há
filtro por location, porque quem lista é precisamente o ecrã que ainda não
sabe qual location escolher (D15). Filtrar por location neste módulo não faz
sentido.

### Sem `requireMinRole`

`GET /locations` fica acessível a qualquer role autenticado (admin, manager,
hr_viewer), ao contrário da maioria dos endpoints de escrita/gestão que
exigem `manager`. Um seletor de loja pode aparecer em ecrãs usados por
qualquer papel (ex.: HR a registar um turno).

## How to test

- Domínio/use cases: `npx jest src/modules/locations --silent` (rápido, sem
  base de dados nem rede — usa `FakeLocationRepository`).
- Todos os testes: `npm test`.
- Lint de fronteiras: `npx depcruise src/modules/locations --config .dependency-cruiser.cjs`.

## Known gaps / open debt

- Não há teste de integração contra o Supabase real — deliberadamente fora
  de scope da spec B2 (D11): a verificação ponta-a-ponta é o smoke de duas
  organizações, não um harness Supabase.
- `isActive` é devolvido mas o frontend ainda não o usa para esconder lojas
  inactivas do seletor — fica para quando esse ecrã for construído.
