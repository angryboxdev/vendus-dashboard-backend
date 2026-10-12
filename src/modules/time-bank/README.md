# Module: time-bank

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Banco de horas**: o excedente e o défice de cada dia fechado vão
para um saldo que se pode compensar em descanso ou pago. Cada mexida é um
movimento novo — o histórico nunca muda; uma correção de um dia antigo entra
como ajuste com a data de hoje.

**Key concepts for the business:**

- **Movimento diário** — excedente (ou défice) de um dia, mais horas com multiplicador e feriado (modo horas).
- **Corte** — a mês vencido (por omissão) ou até ontem: só entram dias até essa data.
- **Compensação** — descanso ou pago (com mês de pagamento), nunca acima do disponível (salvo política) nem do limite anual pago.
- **Validação de excedente** — quando ligada, o excedente de cada dia só entra depois de aprovado; nunca mexe em dias anteriores à data de efeito.
- **Horas categorizadas** — janelas horárias por dia da semana; com fator, geram o multiplicador.

---

## Technical purpose

Tabelas `time_bank_entries` (append-only, um movimento diário por tipo e
dia), `time_bank_validations`, `hour_categories` — migração
`20261017100000`. Lê os dias apurados da assiduidade (a única fonte dos
totais) e os parâmetros `time_tracking.bank.*` do settings.

## Domain concepts

- `dayTarget` / `postingsFor` — o que o dia deve ter; dia novo → movimento diário (mesmo a zero); dia alterado → ajuste de hoje (RE-29).
- `cutoff` — RE-27 (a mês vencido / até ontem).
- `toExpire` — expiração das horas positivas mais antigas; negativas nunca expiram.
- `running` / `summary` — RE-26 (acumulado por dia) e totais.

## Ports

### Input (use cases)

- `TimeBankUseCases` — sincronizar, ledger, compensar (RE-28), ajustar, validações de excedente (CF-6), categorias e relatório de horas categorizadas, o meu ledger.

### Output (domain dependencies)

- `PeriodGuardPort` (módulo periods): datas de períodos fechados — escritas recusadas com 409 `period_closed` (TK-17, RE-30).
- `TimeBankRepositoryPort`, `TimeBankContextPort` (dias da assiduidade, parâmetros por dia, feriado, ficha da conta, hoje), `TimeBankAuditPort`.

## Adapters

### Input

- `createTimeBankRouter` → `/api/novo-rh/time-bank/*` (`hr.attendance`, âmbito por colaborador, Idempotency-Key obrigatório) e `/api/me/time-bank` (só se `employee_sees_history`).
- `GET /api/novo-rh/time-bank/balances` — saldos de todos os colaboradores do âmbito (FE-034), a partir do que está lançado (sem sincronizar; abrir a pessoa sincroniza).

### Output

- `SupabaseTimeBankRepository`, `bankSettingsFrom`.

## Design decisions (ADR summary)

- ADR-0029 (D11): ledger append-only; ajustes datados de hoje; mês vencido por omissão; sem limites nem expiração por omissão; parâmetros por dia (CF-6).
- Ninguém compensa, ajusta ou valida o seu próprio banco.

## How to test

- `npx jest --config jest.config.cjs src/modules/time-bank` (inclui o teste de propriedades do TK-15).

## Known gaps / open debt

- A sincronização automática olha para os últimos 92 dias até ao corte; correções mais antigas entram com "Sincronizar" e período.
- O colaborador ainda não pede compensações (só a gestão lança).
- Avisos de vencimento (dia 1) chegam com as notificações da Fase 9.
