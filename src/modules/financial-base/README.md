# Módulo: financial-base

> Status: ativo
> Última atualização: 2026-06-21

---

## O que é e para que serve (perspectiva de negócio)

A Angrybox tem custos que vêm de muitos sítios diferentes — fornecedores de
ingredientes, serviços de limpeza, rendas, plataformas de marketing, software.
Sem uma estrutura que organize esses custos, é impossível responder a perguntas
simples como "quanto gastámos em operações este mês?" ou "este custo entra na
DRE ou é CAPEX?".

**O problema que resolve:**
Sem centros de custo, todos os gastos caem num balde único — o manager vê o
total mas não percebe onde o dinheiro vai. Sem fornecedores catalogados, cada
fatura que chega exige ir à procura do NIF, do IBAN e das condições de
pagamento. Este módulo cria e mantém essa estrutura base.

**O fluxo do ponto de vista do negócio:**

```
Manager (backoffice)
────────────────────────────────────────────────────
1. Seed inicial carrega os 7 grupos e 28 subcategorias padrão
   (ou manager cria manualmente novos grupos/subcategorias)
2. Cada subcategoria tem regras financeiras:
   afeta DRE? afeta fluxo de caixa? afeta rentabilidade?
3. Manager cria fornecedores com grupo+subcategoria por defeito
   (ex: Makro → OPD / CMV / Ingredientes)
4. À medida que entram faturas, o sistema usa a classificação
   do fornecedor para sugerir o centro de custo
5. DRE, Fluxo de Caixa e Rentabilidade filtram por affects_dre,
   affects_cashflow, affects_profitability
```

**Conceitos-chave para o negócio:**

- **Grupo de Centro de Custo** — agrupamento gerencial de alto nível.
  Exemplos: "OPD" (Operação Direta), "PES" (Pessoal), "FDR" (Fora da DRE).
  São 7 grupos fixos no MVP, mas podem ser criados manualmente.
- **Subcategoria** — classificação específica dentro de um grupo.
  Exemplos: "OPD.01 — CMV / Ingredientes", "EST.01 — Renda / Aluguel".
  Cada subcategoria tem tipo financeiro e três flags de impacto.
- **Tipo financeiro** — natureza da despesa: `cmv`, `variable_cost`,
  `fixed_opex`, `personnel`, `administrative`, `marketing`, `financial`,
  `capex`, `fiscal`, `off_dre`, `internal_transfer`, `transitory`.
- **Fornecedor** — entidade externa que emite faturas. Pode ter grupo e
  subcategoria por defeito para acelerar a classificação automática.

---

## Propósito técnico

Gere os **master data financeiros** da Angrybox: grupos de centros de custo,
subcategorias com regras financeiras e fornecedores. É a fundação de que todos
os outros módulos financeiros dependem — faturas, contas a pagar, conciliação
bancária e relatórios referenciam entidades deste módulo.

Não é responsabilidade deste módulo: calcular totais por centro de custo
(isso vive em `financial-reports`), gerir faturas (módulo `invoices`), nem
gerir contas a pagar (módulo `payable-entries`).

## Conceitos do domínio

- **CostCenterGroup** — grupo principal com `id`, `code` (único, maiúsculas),
  `name`, `description`, `sortOrder`, `isActive`. Imutável: `update()`,
  `activate()`, `deactivate()` retornam novas instâncias.
- **CostCenterCategory** — subcategoria com `groupId`, `code` (único,
  maiúsculas), `name`, `financialType`, e cinco flags booleanas:
  `affectsDre`, `affectsCashflow`, `affectsProfitability`,
  `requiresChannel`, `requiresAllocation`. Imutável.
- **FinancialType** — enum fixo de 12 valores (ver `cost-center-category.ts`).
- **DEFAULT_COST_CENTERS** — constante de domínio com os 7 grupos e 28
  subcategorias padrão. Usada pelo `SeedDefaultCostCentersUseCase`.
- **Supplier** — fornecedor com dados de contacto, IBAN, condições de
  pagamento, `defaultCostCenterGroupId` e `defaultCostCenterCategoryId`
  (sugestão de classificação para novas faturas).

## Ports

### Entrada (use cases)

**Grupos de centros de custo**
- `ListCostCenterGroupsPort` — lista com filtro opcional `isActive`.
- `GetCostCenterGroupPort` — por id; lança `CostCenterGroupNotFoundError`.
- `CreateCostCenterGroupPort` — código único (normalizado); lança `CostCenterGroupCodeAlreadyExistsError`.
- `UpdateCostCenterGroupPort` — actualiza `name`, `description`, `sortOrder`.
- `ToggleCostCenterGroupStatusPort` — activa/desactiva.

**Subcategorias**
- `ListCostCenterCategoriesPort` — lista com filtros `groupId?`, `isActive?`.
- `GetCostCenterCategoryPort` — por id; lança `CostCenterCategoryNotFoundError`.
- `CreateCostCenterCategoryPort` — valida grupo existe + código único; lança erros relevantes.
- `UpdateCostCenterCategoryPort` — actualiza campos editáveis.
- `ToggleCostCenterCategoryStatusPort` — activa/desactiva.
- `SeedDefaultCostCentersPort` — popula os 7 grupos e 28 subcategorias padrão; idempotente.

**Fornecedores**
- `CreateSupplierPort` — cria um novo fornecedor.
- `UpdateSupplierPort` — actualiza campos editáveis.
- `ToggleSupplierStatusPort` — activa ou desactiva.
- `ListSuppliersPort` — lista com filtros `status?` e `search?`.
- `GetSupplierPort` — obtém um fornecedor por id; lança `SupplierNotFoundError`.

### Saída (dependências do domínio)

- `CostCenterGroupRepositoryPort` — `save`, `findById`, `findByCode`, `findAll`, `update`.
- `CostCenterCategoryRepositoryPort` — `save`, `findById`, `findByCode`, `findByGroupId`, `findAll`, `update`.
- `SupplierRepositoryPort` — `save`, `findById`, `findAll`, `update`.

## Adapters

### Entrada

- `FinancialBaseController` → expõe todos os use cases via REST em `/api/financial-base/...`
  (requer role `manager`).

### Saída

- `SupabaseCostCenterGroupRepository` → implementa `CostCenterGroupRepositoryPort` na tabela `cost_center_groups`.
- `SupabaseCostCenterCategoryRepository` → implementa `CostCenterCategoryRepositoryPort` na tabela `cost_center_categories`.
- `SupabaseSupplierRepository` → implementa `SupplierRepositoryPort` na tabela `suppliers`.

## Rotas REST

```
GET    /api/financial-base/cost-center-groups                lista (query: isActive?)
GET    /api/financial-base/cost-center-groups/financial-types lista de tipos financeiros válidos
GET    /api/financial-base/cost-center-groups/:id            detalhe
POST   /api/financial-base/cost-center-groups                criar
PATCH  /api/financial-base/cost-center-groups/:id            actualizar
PATCH  /api/financial-base/cost-center-groups/:id/status     activar/desactivar

GET    /api/financial-base/cost-center-categories            lista (query: groupId?, isActive?)
GET    /api/financial-base/cost-center-categories/:id        detalhe
POST   /api/financial-base/cost-center-categories            criar
PATCH  /api/financial-base/cost-center-categories/:id        actualizar
PATCH  /api/financial-base/cost-center-categories/:id/status activar/desactivar

POST   /api/financial-base/cost-centers/seed                 popular com dados padrão (idempotente)

GET    /api/financial-base/suppliers                         lista (query: status?, search?)
GET    /api/financial-base/suppliers/:id                     detalhe
POST   /api/financial-base/suppliers                         criar
PATCH  /api/financial-base/suppliers/:id                     actualizar
PATCH  /api/financial-base/suppliers/:id/status              activar/desactivar
```

## Tabelas Supabase

```sql
cost_center_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  description text,
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

cost_center_categories (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              uuid        NOT NULL REFERENCES cost_center_groups(id),
  code                  text        NOT NULL UNIQUE,
  name                  text        NOT NULL,
  financial_type        text        NOT NULL,
  affects_dre           boolean     NOT NULL DEFAULT false,
  affects_cashflow      boolean     NOT NULL DEFAULT false,
  affects_profitability boolean     NOT NULL DEFAULT false,
  requires_channel      boolean     NOT NULL DEFAULT false,
  requires_allocation   boolean     NOT NULL DEFAULT false,
  is_active             boolean     NOT NULL DEFAULT true,
  description           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

suppliers (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                         text        NOT NULL,
  nif                          text,
  email                        text,
  phone                        text,
  address                      text,
  iban                         text,
  default_cost_center_group_id    uuid REFERENCES cost_center_groups(id),
  default_cost_center_category_id uuid REFERENCES cost_center_categories(id),
  payment_terms_days           int,
  notes                        text,
  status                       text        NOT NULL DEFAULT 'active',
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);
```

## Decisões de design (ADR resumido)

### Dois níveis, não um — hierarquia Grupo + Subcategoria

A estrutura anterior tinha um `CostCenter` plano com `category` enum e
`subcategory` texto livre. O novo modelo separa em duas entidades: o grupo
(`OPD`, `PES`…) e a subcategoria (`OPD.01 — CMV`, `OPD.03 — Embalagens`…).
Isso permite que DRE, Fluxo de Caixa e Rentabilidade filtrem por flags
precisas em vez de inferir comportamento a partir de um enum de categoria.

### Regras financeiras na subcategoria, não no grupo

Os flags `affectsDre`, `affectsCashflow`, `affectsProfitability`,
`requiresChannel`, `requiresAllocation` vivem na subcategoria. O grupo
é apenas organização gerencial. Assim, subcategorias do mesmo grupo podem
ter comportamentos diferentes (ex: `OPD.03 — Embalagens` exige canal,
`OPD.01 — CMV` não).

### `isActive` em vez de `status: "active" | "inactive"`

Grupos e categorias usam `isActive: boolean` — mais directo e consistente
com o modelo de dados (boolean na DB). Fornecedores mantêm `status` string
por compatibilidade com o modelo existente.

### Seed idempotente como use case, não script SQL

O `SeedDefaultCostCentersUseCase` é testável, reutilizável e chamável via
API (`POST /cost-centers/seed`). Ao contrário de um script SQL, pode ser
executado em qualquer ambiente sem acesso directo à base de dados.

### Código normalizado para maiúsculas no domínio

`CostCenterGroup.create()` e `CostCenterCategory.create()` aplicam
`.trim().toUpperCase()` ao código. Garante que `"opd"` e `"OPD"` são
tratados como o mesmo código independentemente de onde a validação acontece.

### FinancialType como enum fixo (não entidade persistida)

Os 12 tipos financeiros são um union type em vez de entidade com tabela
própria. Simplifica: os tipos financeiros têm semântica precisa e
estável — mudar um tipo teria impacto em DRE/Fluxo/Rentabilidade. Se no
futuro forem necessários tipos dinâmicos, migra-se para entidade separada.

### Supplier migrado de `defaultCostCenterId` para `defaultCostCenterGroupId` + `defaultCostCenterCategoryId`

O campo antigo `defaultCostCenterId` apontava para a tabela `cost_centers`
(plana). Com a nova estrutura de dois níveis, o fornecedor precisa de dois
campos FK para indicar grupo e subcategoria padrão. Ambos são opcionais
(`null`) — fornecedores existentes não perdem dados.

## Como testar

- Domínio/use cases: `npm test -- --testPathPattern=financial-base` (rápido, sem banco nem rede).
- Todos os testes: `npm test`.

## Pontos de atenção / dívidas conhecidas

- O módulo `invoices` tem `ClassificationRule.defaultCostCenterId` (legado) que
  ainda referencia a antiga tabela `cost_centers`. O campo novo
  `defaultCostCenterCategoryId` foi adicionado (migração 057), mas o campo
  legado mantém-se por compatibilidade com dados existentes. Remoção total
  quando a tab "Aplicação em Faturas" for implementada no frontend.
- A tabela `cost_centers` antiga não foi removida automaticamente na migração
  `055_cost_center_groups.sql` — o DROP está comentado para ser feito
  manualmente após confirmar que nenhuma FK activa depende dela.
- O `GetCostCenterGroupPort` e `GetCostCenterCategoryPort` devolvem dados sem
  totais financeiros (total faturado, por pagar). Esses totais virão de
  `financial-reports` quando esse módulo for implementado.
