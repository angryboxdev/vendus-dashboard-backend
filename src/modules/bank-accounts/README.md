# Módulo: bank-accounts

> Status: ativo
> Última atualização: 2026-07-25

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

## Ports

### Entrada (use cases)

- `CreateBankPort` — cria banco.
- `ListBanksPort` — lista bancos com contagem de contas.
- `GetBankPort` — detalhe banco + todas as suas contas.
- `UpdateBankPort` — actualiza campos do banco.
- `DeleteBankPort` — elimina banco (rejeita se tiver contas).
- `CreateBankAccountPort` — cria conta/cartão (valida que banco existe).
- `GetBankAccountPort` — detalhe de uma conta.
- `UpdateBankAccountPort` — actualiza campos da conta.
- `DeleteBankAccountPort` — elimina conta (rejeita se tiver extratos importados).

### Saída (dependências do domínio)

- `BankRepositoryPort` — save, findById, findAll, update, delete, countAccounts.
- `BankAccountRepositoryPort` — save, findById, findByBankId, findByAccountNumber, update, delete, countStatements.

---

## Adapters

### Entrada

- `BankAccountsController` → REST em `/api/bank-accounts`.

### Saída

- `SupabaseBankRepository` → tabela `banks`.
- `SupabaseBankAccountRepository` → tabela `bank_accounts`.

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

O módulo expõe `accountRepo` (instância de `SupabaseBankAccountRepository`) via `createBankAccountsModule()`. Este repositório é structuralmente compatível com o `BankAccountReadPort` de bank-statements (ambos têm `findByAccountNumber` e `findById` com tipos estruturalmente compatíveis). O server.ts injeta este repo no `createBankStatementsModule(bankAccountRead)`.

O banco-statements também tem um fallback `SupabaseBankAccountReadAdapter` que consulta directamente a tabela `bank_accounts` — usado se o módulo for instanciado sem a injecção.

## Decisões de design (ADR resumido)

**Logos como enum de string, não como ficheiro** — o logótipo é uma chave predefinida (ex: `"millennium_bcp"`). Os assets reais (SVG/PNG) vivem no frontend. O backend guarda apenas a chave, tornando a validação simples e evitando upload de imagens.

**Formato do extrato no banco, não na conta** — um banco tem um único formato de extrato; todas as contas/cartões desse banco usam o mesmo parser. Simplifica a lógica de import sem perder flexibilidade real (na prática um banco tem sempre um formato).

**`countAccounts` e `countStatements` no repositório** — a regra "não eliminar se tiver dependentes" é simples o suficiente para resolver com um count no repositório, sem necessidade de lista completa.

**Exposição de `accountRepo` em vez de port separado** — o `SupabaseBankAccountRepository` é estruturalmente compatível com o `BankAccountReadPort` (TypeScript structural typing). Evita criar um adapter wrapper desnecessário.

## Como testar

```bash
# Domínio e use cases (rápido, sem I/O):
npx jest --testPathPattern=src/modules/bank-accounts
```

## Pontos de atenção / dívidas conhecidas

- Parsers para CGD, BPI, Santander ainda não existem — o campo `statementFormat` reserva os valores mas o controller de bank-statements continua a usar apenas millennium_bcp_csv e generic_xlsx.
- Não há validação de formato IBAN (apenas normalização de whitespace/casing). Validação formal poderia ser adicionada no domínio.
- `GET /api/bank-accounts/banks` faz N queries para contar contas (uma por banco). Para volumes grandes, considerar uma query com JOIN ou COUNT GROUP BY.
