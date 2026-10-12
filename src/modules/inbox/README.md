# Module: inbox

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

A **Caixa de pedidos** do Novo RH (FE-050): num só sítio, quem aprova vê e
decide todos os pedidos que lhe cabem — ausências, correções de ponto,
excedente de horas, trocas de turno e solicitações personalizadas —, um a um
ou em lote.

**The problem it solves:**
Os pedidos estavam espalhados por cinco ecrãs (Ausências, Assiduidade, Banco
de horas, Escalas, Tarefas). Pedidos esquecidos ficavam pendentes.

**The flow from the business's point of view:**

```
Aprovador
──────────
1. Abre Novo RH → Pedidos: vê os tipos com o número de pedidos à sua espera
2. "Aguardam a minha decisão" (mais antigos primeiro) · "Outras" (só leitura)
3. Aprova ou recusa (motivo obrigatório), um a um ou vários de uma vez
4. Vê o resultado por pedido: decidido, ou porquê não (período fechado, já decidido…)
```

**Key concepts for the business:**

- **Pedido seu** — nunca se decide o próprio pedido (RE-22): decide o nível seguinte ou o aprovador de recurso.
- **Nível vazio** — um nível sem aprovador vai para o aprovador de recurso e aparece assim (RE-23); nunca é aprovado sozinho.
- **Antiguidade** — cada pedido mostra há quantos dias espera (RE-24).

---

## Technical purpose

Agregador sem tabelas. Cada tipo é uma **fonte** (`InboxSourcePort`) ligada no
`server.ts` ao caso de uso do módulo dono, que continua a aplicar as suas
regras (autoaprovação, nível atual, período fechado, motivo da recusa).

## Domain concepts

- `InboxItem` / `InboxRow` — pedido com requerente, centro, idade, resumo, campos extra (sem dados privados) e `canDecide` + `blockedReason` (`own` | `not_current_level` | `no_permission`).
- Tipos: `leave` (`hr.leave`), `clock` e `overtime` (`hr.attendance`), `swap` (`hr.schedules`), `custom` (`hr.employees`). READ para ver, MANAGE para decidir.
- Recusa: motivo com ≥ 5 caracteres; lote até 50 pedidos.

## Ports

### Input (use cases)

- `InboxUseCases.list(org, viewer, { type, segment })` — tipos visíveis, contadores (`mine`/`others`) e pedidos do âmbito (RE-34).
- `InboxUseCases.decide(org, viewer, keys, decision, comment)` — revalida cada pedido e decide pela fonte; resultado por pedido. Erros de regra (`*ValidationError`, `*ConflictError`, `*ForbiddenError`, `*NotFoundError`, `*RuleError`, `*BlockedError`, `WorkspaceError`) vêm na linha; erros internos propagam.

### Output (domain dependencies)

- `InboxSourcePort` (um por tipo) e `InboxDirectoryPort` (nome e centro dos colaboradores).

## Adapters

### Input

- `inbox.controller.ts` → `GET /api/novo-rh/inbox?type&segment` e `POST /api/novo-rh/inbox/decide` `{ items: ["leave:<id>", …], decision, comment }` (Idempotency-Key obrigatória). Rota da área de gestão (`base`); a permissão de cada tipo é verificada no caso de uso.

### Output

- Nenhum próprio (fontes no `server.ts`).

## Design decisions (ADR summary)

- Agregar em vez de criar uma tabela de "aprovações": cada módulo continua dono do seu pedido e das suas regras.
- Trocas de turno decididas daqui não confirmam avisos de restrições: se a escala tiver avisos, a decisão falha com a mensagem e faz-se em Escalas.
- O excedente lista os dias por validar de cada colaborador do âmbito (pode ser lento em organizações grandes).

## How to test

- `npx jest --config jest.config.cjs src/modules/inbox`

## Known gaps / open debt

- Aprovação parcial de excedente (FE-053) e convites/adesões (FE-054) ainda não existem.
- Sem linha temporal dos níveis no detalhe (a de ausências está em Ausências → pedido).
