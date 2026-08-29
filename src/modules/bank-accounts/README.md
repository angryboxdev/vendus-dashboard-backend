# Módulo: bank-accounts

> Status: ativo
> Última atualização: 2026-08-28

---

## O que é e para que serve (perspectiva de negócio)

O módulo de Bancos e Contas é o pré-requisito para a Conciliação Bancária. Antes de importar extratos, o gestor regista os bancos onde a empresa tem relação e, dentro de cada banco, as contas correntes e cartões de crédito existentes. Este registo permite que o sistema associe automaticamente os extratos importados à conta certa e apresente uma vista organizada por banco → conta → extratos.

**O problema que resolve:**
Sem este módulo, os extratos importados ficam soltos sem ligação a uma conta estruturada, impossibilitando filtrar por conta, ver o histórico de uma conta específica ou navegar de forma hierárquica no painel financeiro.

**O fluxo do ponto de vista do negócio:**

```
Gestor Financeiro
──────────────────────────────────────────
1. Entra em Conciliação Bancária
2. Se não houver bancos → botão "Adicionar banco"
3. Preenche: nome, logótipo (lista predefinida), cor, país, BIC (opcional), formato do extrato
4. Dentro do banco → "Adicionar conta" ou "Adicionar cartão"
5. Para conta: IBAN (opcional), nº de conta (opcional), tipo (corrente/poupança/ordenado), apelido
6. Para cartão: últimos 4 dígitos, nome, limite (opcional), dia do ciclo (opcional)
7. Ao importar extrato → sistema tenta ligar automaticamente pelo IBAN/nº de conta
8. Se não ligar → frontend pergunta ao utilizador qual conta escolher (ou cria nova)
```

**Conceitos-chave para o negócio:**

- **Banco** — instituição financeira (ex: Millennium BCP). Tem logótipo predefinido, cor de identificação e formato de extrato associado.
- **Conta** — conta corrente, poupança ou ordenado dentro de um banco. Pode ter IBAN ou número de conta para auto-detecção.
- **Cartão de crédito** — instrumento de pagamento associado a um banco. Identificado pelos últimos 4 dígitos.
- **Formato do extrato** — identifica qual parser o sistema usa ao importar o ficheiro CSV/XLSX deste banco.
- **Auto-link** — ao importar um extrato, o sistema tenta associá-lo automaticamente à conta registada cujo IBAN ou número de conta coincide com o campo extraído do ficheiro.

---

## Propósito técnico

Gere bancos e contas bancárias como entidades de domínio independentes. Fornece um port cross-módulo (`BankAccountReadPort`) para que o módulo bank-statements possa tentar ligar automaticamente os imports a contas cadastradas sem criar uma dependência directa entre módulos.

## Conceitos do domínio

### Entidades

**Bank**
- `name`, `logoKey` (enum predefinido), `color` (hex), `country` (ISO 3166-1), `bic` (opcional), `statementFormat` (enum)
- Invariantes: name não vazio; color deve ser hex válido (#RRGGBB).

**BankAccount**
- `type`: `account` | `credit_card`
- Campos de conta: `iban`, `accountNumber`, `accountType` (corrente/poupança/ordenado)
- Campos de cartão: `lastFourDigits` (4 dígitos), `cardName`, `creditLimitCents`, `billingCycleDay` (1–31)
- Invariantes: `lastFourDigits` exactamente 4 dígitos; `billingCycleDay` entre 1 e 31; campos de tipo oposto ignorados na criação.
- `matchesAccountNumber(raw)` — normaliza e compara IBAN e accountNumber (case/whitespace insensitive).

### Logos predefinidos

`millennium_bcp · cgd · santander · bpi · novo_banco · banco_ctt · activobank · montepio · bankinter · eurobic · abanca · credito_agricola · bbva · ing · revolut · wise · other`

### Formatos de extrato

| Valor | Parser disponível |
|---|---|
| `millennium_bcp_csv` | Sim |
| `generic_xlsx` | Sim |
| `generic_csv` / `cgd_csv` / `bpi_csv` / `santander_csv` | Futuro |

---

## Isolamento por organização (spec B2)

Este módulo foi o piloto da spec B2 (`.scratch/scoped-access/spec.md`,
D1/D2, ADR-0008) — o primeiro módulo hexagonal completo convertido para
passar a organização explicitamente por todo o caminho, em vez de confiar
num client Supabase sem filtro. As decisões de estilo abaixo são as que os
outros dezoito módulos a converter (ver `.scratch/scoped-access/issues/`)
copiam.

- **Output ports**: `organizationId: OrganizationId` é sempre o **primeiro
  parâmetro, separado**, em todos os métodos — nunca um campo dentro de um
  objecto de filtro (D2 é explícito quanto a isto: misturar os dois torna a
  tenancy um campo de negócio como outro qualquer, em vez de "só podes ver
  isto").
- **Input ports (use cases)**: `organizationId` viaja como **campo dentro do
  objecto de comando/query** que o `execute()` já recebia. Um port que antes
  recebia um primitivo isolado (`execute(id: string)`, `execute(bankId: string)`,
  `execute()`) passou a receber um objecto com esse campo mais
  `organizationId` — nomeado `<Verbo><Entidade>Command` para escritas e
  `<Verbo><Entidade>Query` para leituras (ex.: `GetBankQuery = { organizationId, id }`,
  `DeleteBankCommand = { organizationId, id }`). Isto mantém uma única forma
  de chamar qualquer use case — um objecto — em vez de dois estilos
  (posicional vs. objecto) consoante o port já tivesse campos ou não.
- **Controller**: lê de `req.auth!.orgId` (populado pelo middleware de auth a
  partir do claim verificado) e coloca-o no comando/query — nunca do body ou
  de params, para não ser um valor que o cliente possa escolher.
- **Adapters**: recebem o `ScopedQueryFactory` (`createScopedQuery`) no
  construtor, não um `SupabaseClient`, e chamam `this.scopedQuery(organizationId).table(...)`
  por operação — ver `SupabaseBankRepository`/`SupabaseBankAccountRepository`.
- **Domínio**: as entities (`Bank`, `BankAccount`) não ganharam um campo
  `organizationId` — a organização é uma preocupação de acesso/query, não um
  invariante de negócio da entidade, tal como em `locations`.

### Ponte cross-módulo (histórico, resolvida pelo ticket 09)

`createBankAccountsModule()` expunha `accountRepo` directamente (o próprio
`SupabaseBankAccountRepository`) para o módulo bank-statements o injectar
como o seu `BankAccountReadPort` — compatibilidade estrutural, sem port
dedicado. Essa forma partiu quando `findByAccountNumber`/`findById` ganharam
`organizationId` como primeiro parâmetro (este ticket): bank-statements
ainda não estava convertido e não tinha uma organização de pedido para
passar no seu próprio composition root.

Entretanto, um `BankAccountCrossModuleReadAdapter` temporário fixava a
organização de bank-statements em `UNATTENDED_SCOPE` em vez da do chamador
— inofensivo enquanto existisse uma só organização, mas dívida deliberada.
**O ticket 09 eliminou esse ficheiro**: bank-statements agora tem a sua
própria organização de pedido (de `req.auth!.orgId`, threaded pelo seu
próprio controller/use cases) e chama `BankAccountRepositoryPort`
directamente com ela, tal como qualquer outro consumidor convertido. A
compatibilidade estrutural com o `BankAccountReadPort` de bank-statements
voltou a valer, agora com `organizationId` explícito dos dois lados.

---

## Ports

### Entrada (use cases)

- `CreateBankPort` — cria banco. `CreateBankCommand` inclui `organizationId`.
- `ListBanksPort` — lista bancos com contagem de contas. `ListBanksQuery = { organizationId }`.
- `GetBankPort` — detalhe banco + todas as suas contas. `GetBankQuery = { organizationId, id }`.
- `UpdateBankPort` — actualiza campos do banco. `UpdateBankCommand` inclui `organizationId`.
- `DeleteBankPort` — elimina banco (rejeita se tiver contas). `DeleteBankCommand = { organizationId, id }`.
- `CreateBankAccountPort` — cria conta/cartão (valida que banco existe). `CreateBankAccountCommand` inclui `organizationId`.
- `ListBankAccountsPort` — lista contas de um banco. `ListBankAccountsQuery = { organizationId, bankId }`.
- `GetBankAccountPort` — detalhe de uma conta. `GetBankAccountQuery = { organizationId, id }`.
- `UpdateBankAccountPort` — actualiza campos da conta. `UpdateBankAccountCommand` inclui `organizationId`.
- `DeleteBankAccountPort` — elimina conta (rejeita se tiver extratos importados). `DeleteBankAccountCommand = { organizationId, id }`.

### Saída (dependências do domínio)

- `BankRepositoryPort` — `save(organizationId, bank)`, `findById(organizationId, id)`,
  `findAll(organizationId)`, `update(organizationId, bank)`, `delete(organizationId, id)`.
- `BankAccountRepositoryPort` — `save(organizationId, account)`, `findById(organizationId, id)`,
  `findByBankId(organizationId, bankId)`, `findByAccountNumber(organizationId, raw)`,
  `update(organizationId, account)`, `delete(organizationId, id)`,
  `countStatements(organizationId, accountId)`.

Em ambos, `organizationId` é sempre o primeiro parâmetro do método (D2).

---

## Adapters

### Entrada

- `BankAccountsController` → REST em `/api/bank-accounts`.

### Saída

- `SupabaseBankRepository` → tabela `banks`, via `ScopedQueryFactory` (D2) — não guarda um `SupabaseClient`.
- `SupabaseBankAccountRepository` → tabela `bank_accounts` (e `bank_statement_imports` em `countStatements`), via `ScopedQueryFactory`. Também exposta directamente ao módulo bank-statements como `accountRepo` (ver secção "Cross-módulo" abaixo).

### Rotas

```
GET    /api/bank-accounts/logos                        lista de logoKeys disponíveis
GET    /api/bank-accounts/formats                      lista de statementFormats
GET    /api/bank-accounts/banks                        listar bancos (com accountsCount)
POST   /api/bank-accounts/banks                        criar banco
GET    /api/bank-accounts/banks/:bankId                detalhe banco + contas
PATCH  /api/bank-accounts/banks/:bankId                actualizar banco
DELETE /api/bank-accounts/banks/:bankId                eliminar banco (409 se tiver contas)
POST   /api/bank-accounts/banks/:bankId/accounts       criar conta/cartão
GET    /api/bank-accounts/:accountId                   detalhe conta
PATCH  /api/bank-accounts/:accountId                   actualizar conta
DELETE /api/bank-accounts/:accountId                   eliminar conta (409 se tiver extratos)
```

---

## Cross-módulo: bank-statements

O módulo expõe `accountRepo` via `createBankAccountsModule()` — o próprio
`SupabaseBankAccountRepository`, tipado como `BankAccountRepositoryPort`.
bank-statements injecta-o directamente como o seu `BankAccountReadPort`
(compatibilidade estrutural: ambos têm `organizationId` como primeiro
parâmetro desde o ticket 09, e `BankAccountRepositoryPort` tem um
sobreconjunto dos métodos que `BankAccountReadPort` pede, devolvendo
`BankAccount`, que estruturalmente satisfaz `{ id: string }`). O server.ts
injecta-o em `createBankStatementsModule(bankAccountRead)`, que agora exige
este parâmetro (deixou de ter fallback próprio — ver README de
bank-statements).

## Decisões de design (ADR resumido)

**Logos como enum de string, não como ficheiro** — o logótipo é uma chave predefinida (ex: `"millennium_bcp"`). Os assets reais (SVG/PNG) vivem no frontend. O backend guarda apenas a chave, tornando a validação simples e evitando upload de imagens.

**Formato do extrato no banco, não na conta** — um banco tem um único formato de extrato; todas as contas/cartões desse banco usam o mesmo parser. Simplifica a lógica de import sem perder flexibilidade real (na prática um banco tem sempre um formato).

**`countAccounts` e `countStatements` no repositório** — a regra "não eliminar se tiver dependentes" é simples o suficiente para resolver com um count no repositório, sem necessidade de lista completa.

**Exposição de `accountRepo` em vez de port separado** — o `SupabaseBankAccountRepository` é estruturalmente compatível com o `BankAccountReadPort` de bank-statements (TypeScript structural typing), evitando um adapter wrapper dedicado. A conversão deste módulo para `organizationId` explícito (D2) quebrou essa compatibilidade temporariamente, até bank-statements ser convertido também (ticket 09) — ver "Ponte cross-módulo" acima para o histórico.

## Como testar

```bash
# Domínio e use cases (rápido, sem I/O):
npx jest --testPathPattern=src/modules/bank-accounts
```

## Pontos de atenção / dívidas conhecidas

- Parsers para CGD, BPI, Santander ainda não existem — o campo `statementFormat` reserva os valores mas o controller de bank-statements continua a usar apenas millennium_bcp_csv e generic_xlsx.
- Não há validação de formato IBAN (apenas normalização de whitespace/casing). Validação formal poderia ser adicionada no domínio.
- `GET /api/bank-accounts/banks` faz N queries para contar contas (uma por banco). Para volumes grandes, considerar uma query com JOIN ou COUNT GROUP BY.
