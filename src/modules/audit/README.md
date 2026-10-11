# Module: audit

> Status: active
> Last updated: 2026-10-11

---

## What it is and what it's for (business perspective)

O registo de auditoria do Novo RH: cada alteração fica guardada com **quem**,
**quando**, **o quê**, o valor **antes** e **depois**, o **motivo**, o **IP** e
o **dispositivo**. Não se pode alterar nem apagar, e é possível provar que
ninguém mexeu nos registos.

**The problem it solves:**
Sem um registo à prova de alteração não se consegue responder a "quem mudou
isto e porquê", nem demonstrar conformidade (RGPD, inspeção do trabalho).

**The flow from the business's point of view:**

```
Qualquer ecrã do Novo RH            Admin / auditor
──────────────────────             ──────────────────────
1. Alguém altera algo         →    2. Consulta por recurso/data
   (com motivo, quando exigido)     3. Exporta CSV
                                    4. Verifica a integridade da cadeia
```

**Key concepts for the business:**

- **Evento** — uma alteração registada; nunca se edita.
- **Cadeia** — cada evento guarda a impressão digital (hash) do anterior; se alguém mexer num registo antigo, a verificação aponta o primeiro registo adulterado.

---

## Technical purpose

Tabela `audit_events` append-only, numerada e encadeada por SHA-256 por
organização **dentro da BD** (trigger com bloqueio por organização), mais a
porta `RecordAuditEventPort` que os outros módulos do Novo RH recebem pelo
composition root. Não substitui as tabelas de auditoria por domínio do RH
atual (`*_audit_logs`).

## Domain concepts

- `AuditEventInput` (actor, action `área.recurso.ação`, resourceType, resourceId, before, after, reason) + contexto do pedido (ip, userAgent, correlationId).
- Invariantes: códigos em minúsculas `[a-z0-9_.]`; seq, data e hash nunca vêm da aplicação.

## Ports

### Input (use cases)

- `RecordAuditEventPort.record` — usado pelos módulos (hoje: settings).
- `AuditQueryPorts.list` / `verify` — consulta e verificação da cadeia.

### Output (domain dependencies)

- `AuditStorePort` — append, query, verify.
- `AuditContextPort` — IP, dispositivo e correlação do pedido em curso.

## Adapters

### Input

- `AuditController` → `/api/novo-rh/audit/events`, `/events.csv`, `/verify` (permissão `governance.audit`).

### Output

- `SupabaseAuditStore` (scoped-query; `verifyAuditChain()` → RPC `verify_audit_chain`).
- `HttpAuditContext` — lê `currentRequestContext()` do middleware de correlação (`trust proxy` ligado para o IP real atrás do Render).

## Design decisions (ADR summary)

- Hash e numeração na BD, não na aplicação: duas instâncias a escrever ao mesmo tempo não partem a cadeia, e o texto canónico (jsonb, data em UTC) é o mesmo na escrita e na verificação.
- O rollback da migração nunca apaga a tabela (task §4.6.7).

## How to test

- `npx jest --config jest.config.cjs src/modules/audit`.
- O trigger e `verify_audit_chain` só se testam no stack local do Supabase (integração, por fazer — ticket 09).

## Known gaps / open debt

- A escrita do evento e a alteração não estão na mesma transação (outbox transacional — ticket 10).
- Retenção definida pela decisão D4 (DPO).
