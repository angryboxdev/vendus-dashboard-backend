# Módulo: financial-base

> Status: ativo
> Última atualização: 2026-06-16

## O que é e para que serve (perspectiva de negócio)

A Angrybox tem custos que vêm de muitos sítios diferentes — fornecedores de
ingredientes, serviços de limpeza, rendas, plataformas de marketing, software. Sem
uma estrutura que organize esses custos, é impossível responder a perguntas simples
como "quanto gastámos em operações este mês?" ou "quem é o fornecedor X e qual é o
IBAN dele?".

**O problema que resolve:**
Sem centros de custo, todos os gastos caem num balde único — o manager vê o total
mas não percebe onde o dinheiro está a ir. Sem fornecedores catalogados, cada vez
que chega uma fatura há que voltar a procurar o NIF, o IBAN, as condições de
pagamento. Este módulo cria e mantém essa estrutura base.

**O fluxo do ponto de vista do negócio:**

```
Manager (backoffice)
────────────────────────────────────────────────────
1. Cria os centros de custo da empresa
   (ex: ADM — Administração, OPE — Operações, MKT — Marketing)
2. Cria os fornecedores com os dados necessários
   (NIF, IBAN, condições de pagamento, CC por defeito)
3. À medida que entram faturas, o sistema usa automaticamente
   os fornecedores e os CCs para classificar e agrupar custos
4. O manager pode activar/desactivar CCs ou fornecedores
   sem os apagar (preserva histórico)
```

**Conceitos-chave para o negócio:**

- **Centro de Custo (CC)** — área ou função da empresa que origina despesas.
  Exemplos: "ADM" (salários, contabilidade), "OPE" (ingredientes, embalagens),
  "MKT" (publicidade, redes sociais). Cada CC tem uma categoria que permite
  agrupamentos mais amplos nos relatórios.
- **Fornecedor** — entidade externa que emite faturas para a Angrybox. Ter o
  fornecedor catalogado com IBAN e condições de pagamento (ex: 30 dias) permite
  ao módulo de faturas alertar sobre vencimentos e pré-preencher dados.
- **CC por defeito do fornecedor** — atalho: quando a Makro emite uma fatura,
  o sistema pode sugerir automaticamente o CC "OPE". Poupa tempo na classificação.

---

## Propósito técnico

Gere os **master data financeiros** da Angrybox: centros de custo e fornecedores.
É a fundação de que todos os outros módulos financeiros dependem — faturas,
contas a pagar, conciliação bancária e relatórios referenciam entidades deste módulo.

Não é responsabilidade deste módulo: calcular totais por centro de custo
(essa lógica vive em `financial-reports`), gerir faturas (módulo `invoices`),
nem gerir contas a pagar (módulo `cobrar-e-pagar`).

## Conceitos do domínio

- **CostCenter** — entidade com `id`, `code` (único, normalizado para maiúsculas),
  `name`, `category` (`CostCenterCategory`), `subcategory`, `description`,
  `responsibleName` e `status` (`"active"|"inactive"`). Imutável: `update()`,
  `activate()` e `deactivate()` retornam novas instâncias.
- **Supplier** — fornecedor com dados de contacto, IBAN, condições de pagamento
  e `defaultCostCenterId` (sugestão de centro de custo para novas faturas).
  Imutável: `update()`, `activate()`, `deactivate()` retornam novas instâncias.
- **CostCenterCategory** — enum de categorias válidas: `administration`,
  `operations`, `marketing`, `logistics`, `hr`, `technology`, `finance`,
  `real_estate`, `app_delivery`, `other`.

## Ports

### Entrada (use cases)

**Centros de custo**
- `CreateCostCenterPort` — cria um novo CC; lança `CostCenterCodeAlreadyExistsError` se o código já existe.
- `UpdateCostCenterPort` — actualiza campos editáveis (não o código).
- `ToggleCostCenterStatusPort` — activa ou desactiva.
- `ListCostCentersPort` — lista com filtros opcionais de categoria e status.
- `GetCostCenterPort` — obtém um CC por id; lança `CostCenterNotFoundError` se não existe.

**Fornecedores**
- `CreateSupplierPort` — cria um novo fornecedor.
- `UpdateSupplierPort` — actualiza campos editáveis.
- `ToggleSupplierStatusPort` — activa ou desactiva.
- `ListSuppliersPort` — lista com filtros opcionais de status e search (nome/NIF).
- `GetSupplierPort` — obtém um fornecedor por id; lança `SupplierNotFoundError` se não existe.

### Saída (dependências do domínio)

- `CostCenterRepositoryPort` — `save`, `findById`, `findByCode`, `findAll`, `update`.
- `SupplierRepositoryPort` — `save`, `findById`, `findAll`, `update`.

## Adapters

### Entrada

- `FinancialBaseController` → expõe todos os use cases via REST em `/api/financial-base/...`
  (requer role `manager`).

### Saída

- `SupabaseCostCenterRepository` → implementa `CostCenterRepositoryPort` na tabela `cost_centers`.
- `SupabaseSupplierRepository` → implementa `SupplierRepositoryPort` na tabela `suppliers`.

## Rotas REST

```
GET    /api/financial-base/cost-centers              lista (query: category?, status?)
GET    /api/financial-base/cost-centers/categories   lista de categorias válidas
GET    /api/financial-base/cost-centers/:id          detalhe
POST   /api/financial-base/cost-centers              criar
PATCH  /api/financial-base/cost-centers/:id          actualizar
PATCH  /api/financial-base/cost-centers/:id/status   activar/desactivar

GET    /api/financial-base/suppliers                 lista (query: status?, search?)
GET    /api/financial-base/suppliers/:id             detalhe
POST   /api/financial-base/suppliers                 criar
PATCH  /api/financial-base/suppliers/:id             actualizar
PATCH  /api/financial-base/suppliers/:id/status      activar/desactivar
```

## Tabelas Supabase

```sql
cost_centers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  category         text NOT NULL,
  subcategory      text,
  description      text,
  responsible_name text,
  status           text NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

suppliers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  nif                   text,
  email                 text,
  phone                 text,
  address               text,
  iban                  text,
  default_cost_center_id uuid REFERENCES cost_centers(id),
  payment_terms_days    int,
  notes                 text,
  status                text NOT NULL DEFAULT 'active',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

## Decisões de design (ADR resumido)

### Código do CC normalizado para maiúsculas no domínio

`CostCenter.create()` aplica `.trim().toUpperCase()` ao código. Isto garante que
`"adm"` e `"ADM"` são tratados como o mesmo código independentemente de onde
a validação de duplicado acontece (domínio ou repositório).

### Entidades imutáveis com factory methods

`update()`, `activate()` e `deactivate()` retornam novas instâncias em vez de
mutar o objecto. Facilita rastreabilidade e torna o comportamento previsível
em testes — a instância original fica inalterada.

### Sem entidade `FinancialCategory` separada

As categorias gerenciais são um enum fixo (`CostCenterCategory`) em vez de uma
entidade persistida. Simplifica o modelo: categorias não têm ciclo de vida
próprio e a lista não vai mudar frequentemente. Se no futuro for necessário
categorias dinâmicas, migra-se para entidade separada.

## Como testar

- Domínio/use cases: `npm test -- --testPathPattern=financial-base` (rápido, sem banco nem rede).
- Todos os testes: `npm test`.

## Pontos de atenção / dívidas conhecidas

- O `GetCostCenterPort` devolve apenas os dados do CC sem totais financeiros
  (total faturado, por pagar, vencido). Esses totais serão calculados por
  `financial-reports` quando esse módulo for implementado.
- A pesquisa de fornecedores por `search` usa `ilike` no Supabase (por nome).
  Não pesquisa por NIF — adicionar se necessário.
