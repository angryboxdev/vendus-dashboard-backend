# Módulo: locations

> Status: ativo
> Última atualização: 2026-10-04

---

## O que é e para que serve (perspectiva de negócio)

Uma organização pode ter mais do que uma loja/restaurante ou espaço
("location" — ex.: Mercado, Gaia, Escritório, Armazém). O Local é
**transversal**: RH, Stock, Financeiro e os restantes módulos referenciam-no
por `location_id`, nunca por texto. Desde a Base Organizacional (ticket 02)
o admin gere os Locais na aba **Empresa & Estrutura → Locais**.

**O problema que resolve:**
Sem este módulo o front end não tem forma de listar as lojas do chamador
para um seletor, e criar/corrigir um Local exigia o script de provisioning.

**O fluxo do ponto de vista do negócio:**

```
Admin (Empresa & Estrutura → Locais)      Qualquer utilizador
──────────────────────────────────        ──────────────────────────────
1. Cria/edita um Local (morada,           3. Escolhe o Local num seletor
   município, fuso, telefone…)               (só aparecem os ativos)
2. Inativa um Local que fechou     →      4. Registos antigos desse Local
   (nunca o apaga)                           continuam válidos e visíveis
```

**Key concepts for the business:**

- **Local (Location)** — loja ou espaço físico/operacional da organização.
  Não é a Empresa: NIF, NISS e razão social pertencem à Empresa (módulo
  `organization`), nunca ao Local.
- **Inativo** — Local que deixou de operar: some dos seletores de escrita,
  mas todo o histórico continua ligado a ele.

---

## Technical purpose

Lista os Locais da organização do chamador (spec B2, D15 — leitura escopada
pela organização) e, desde a Base Organizacional, cria, edita e
ativa/inativa Locais com auditoria. Nunca apaga um Local (o único `delete`
de `locations` no código é o rollback do script de provisioning). Também
expõe `findOneForOrganization`, usado por `location-credentials` para
confirmar posse antes de emitir um pairing code.

## Domain concepts

- **Location** — imutável; `create(id, details, now)` e `update(changes,
  now)` normalizam (trim, código em maiúsculas, vazio → `null`) e validam,
  reportando **todos** os campos inválidos (`InvalidLocationError`):
  nome obrigatório (≤ 120), código opcional (`[A-Z0-9_-]{1,20}`), país ISO
  de 2 letras, código postal `NNNN-NNN` se `country = PT`, telefone,
  fuso IANA válido. `deactivate`/`activate` só mudam `isActive`.
  `reconstitute` aceita registos antigos só com os 5 campos originais
  (`id`, `name`, `code`, `timezone`, `isActive`).
- **Código interno** — opcional, único por organização quando preenchido
  (`DuplicateLocationCodeError`).

## Ports

### Input (use cases)

- `ListLocationsPort` — todas as Locais (ativas e inativas) da organização;
  cada consumidor filtra `isActive` (os `LocationReadPort` de stock já o
  fazem).
- `CreateLocationPort` — cria ativa + auditoria `create`.
- `UpdateLocationPort` — alteração parcial dos dados + auditoria `update`.
- `SetLocationActivePort` — ativar/inativar; idempotente (o estado atual
  não grava nem audita) + auditoria `activate`/`deactivate`.
- `ListLocationHistoryPort` — histórico de um Local (404 se não for da
  organização).

### Output (domain dependencies)

- `LocationRepositoryPort` — `findAllForOrganization`,
  `findOneForOrganization` (ownership check), `insert`, `update` (sem
  delete).
- `LocationAuditLogPort` — fire-and-forget, mirror de
  `OrganizationAuditLogPort`.

## Adapters

### Input

- `LocationController` → `GET /locations` (qualquer role autenticado);
  `POST /locations`, `PATCH /locations/:id`, `PATCH /locations/:id/active`
  (`{ active: boolean }`) e `GET /locations/:id/history` com
  `requireMinRole("admin")` inline. 400 devolve `fieldErrors`; 409 (código
  duplicado) devolve `fieldErrors: [{ field: "code" }]`. Não existe DELETE.

### Output

- `SupabaseLocationRepository` → tabela `locations` via `ScopedQuery`
  (factory injectado, D2). Traduz a violação de `unique (org_id, code)`
  (`23505`) para `DuplicateLocationCodeError`.
- `SupabaseLocationAuditLogAdapter` → `location_audit_logs`.

## Design decisions (ADR summary)

### Read scoped pela organização, não pela location

O endpoint devolve todas as locations da organização do chamador — não há
filtro por location, porque quem lista é precisamente o ecrã que ainda não
sabe qual location escolher (D15).

### `GET /locations` sem `requireMinRole`; gestão só `admin`

Um seletor de loja aparece em ecrãs usados por qualquer papel. Criar,
editar e inativar é configuração da organização — `admin`, como a Empresa.

### Inativar, nunca apagar

Cerca de 20 tabelas referenciam `location_id` (FK compostas). Inativar só
muda `is_active`, por isso todas as relações históricas continuam
válidas; os seletores de escrita é que deixam de oferecer o Local.

### Código interno opcional

`code` deixou de ser `NOT NULL` (`20261004110000_locations_management.sql`);
a restrição `unique (org_id, code)` mantém-se (vários `NULL` não colidem).
Nenhum código lê `code` fora do provisioning.

### Sem ligação a centro de custo (por agora)

A task marca "centro de custo associado" como opcional; os `cost_center_*`
do `financial-base` são classificação de despesa, não centros de custo por
loja — fica fora até existir esse conceito (spec D7).

## How to test

- Domínio/use cases: `npx jest src/modules/locations --testPathIgnorePatterns=integration`
  (fakes, sem BD).
- Adapters: `npx jest src/modules/locations/__tests__/integration`
  (requer `supabase start` + `supabase db reset`).
- Lint de fronteiras: `npm run lint:deps`.

## Known gaps / open debt

- `Location.timezone` continua a não ser lido por nenhum módulo (o sistema
  usa `REPORT_TIMEZONE`).
- Sem filtro de leitura por location (ADR-0009, provisório).
