# Module: absences

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Ausências**: tipos de ausência (férias, permissões, licenças,
compensação), pedidos do colaborador ou atribuídos pela gestão, aprovação em
vários níveis e saldos que nunca se apagam (cada mexida é um movimento).

**Key concepts for the business:**

- **Tipo de ausência** — diz como conta (dias úteis/corridos ou horas), o limite, se precisa de aprovação, se é privado, se exige documento e o que faz ao tempo (tira ao teórico, conta como trabalho ou nada).
- **Fluxo de aprovação** — até 5 níveis; cada nível tem pessoas e/ou papéis (responsáveis do colaborador, um perfil de acesso).
- **Recurso** — quem aprova quando um nível fica sem ninguém (pessoas do fluxo ou, sem elas, os administradores). Fica um alerta.
- **Saldo** — soma dos movimentos: acumulação, pedidos, anulações, ajustes, compensações de feriado.

---

## Technical purpose

Tabelas `absence_types`, `approval_flows`, `absence_requests`,
`approval_decisions` (append-only), `leave_balance_entries` (append-only)
— migração `20261016100000`. Usa contratos e responsáveis (people), plano
diário e calendários (time-base) e horas trabalhadas (attendance). Dá à
assiduidade o efeito das ausências aprovadas em cada dia (`dayEffects`).

## Domain concepts

- `requestAmount` — RE-19 (dia sem trabalho → indisponível), RE-20 (dias corridos), RE-21/CF-8 (horas só dentro do horário).
- `snapshotLevels` — RE-22 (quem pede e o colaborador nunca aprovam), RE-23 (nível vazio escala, nunca aprova sozinho).
- `validateFlow` — CF-5 (nível sem aprovador não grava).
- `periodStart` / `accrualFor` / `summarize` — período do saldo (ano natural ou de trabalho), acumulação com antiguidade, disponível = saldo − pendentes.
- `absenceEffect` — CF-7.

## Ports

### Input (use cases)

- `AbsencesUseCases` — tipos, fluxos, pedidos (criar, decidir, cancelar), caixa do aprovador, saldos, ajustes, efeito diário, compensação de feriados (CF-9).

### Output (domain dependencies)

- `PeriodGuardPort` (módulo periods): datas de períodos fechados — escritas recusadas com 409 `period_closed` (TK-17, RE-30).
- `AbsencesRepositoryPort`, `AbsencesContextPort`, `AbsencesNotifierPort`, `AbsencesAuditPort`, `AbsencesClockPort`.

## Adapters

### Input

- `createAbsencesAdminRouter` → `/api/novo-rh/absences/*` (`hr.leave`, âmbito por colaborador, Idempotency-Key obrigatório).
- `createAbsencesMeRouter` → `/api/me/absences*` (as minhas) e `/api/me/approvals*` (caixa do aprovador; a autorização é estar no nível atual).

### Output

- `SupabaseAbsencesRepository`, `SupabaseAbsencesDirectory` (fichas ↔ contas, titulares de perfis), `coverage` (TK-14).

## Design decisions (ADR summary)

- O motor de fluxos também serve as **correções de ponto** (âmbito `clock`, FE-113): `correctionLevels` devolve os níveis para a assiduidade (mesmas regras de recurso e de exclusão de quem pede).
- ADR-0028: D9 recurso = pessoas do fluxo ou administradores; sem autoaprovação; saldos em ledger; nenhum tipo criado por omissão; fora do contrato é sempre recusado; ausências privadas com `hr.absences_private`.
- Atribuída pela gestão = aprovada (salvo se quem atribui é o próprio colaborador).
- Uma aprovada só a gestão cancela, com motivo, e gera anulação no saldo.

## How to test

- `npx jest --config jest.config.cjs src/modules/absences`.

## Known gaps / open debt

- Sem proporcionalidade da acumulação por data de entrada nem expiração/transição automáticas (regras legais a validar — os tipos de movimento já existem).
- Anexos: guarda a referência a um documento; o carregamento é pelo módulo de documentos.
- Edição de um pedido = cancelar e pedir de novo.
- Alertas de pedidos parados (RE-24) na Fase 9.
- Sem teste de integração dos triggers append-only (sem Docker neste PC).
