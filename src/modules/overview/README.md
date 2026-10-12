# Module: overview

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

O **Painel** do Novo RH: num só ecrã, o dono ou a gestão vê o que se passa
hoje na empresa — quem está a trabalhar, quem faltou, quem chegou atrasado,
quem está ausente, o que está pendente — e abre o detalhe de cada pessoa.

**The problem it solves:**
Para saber se alguém faltou ou chegou tarde era preciso abrir a assiduidade
pessoa a pessoa. O painel junta tudo e põe primeiro o que pede atenção.

**The flow from the business's point of view:**

```
Dono / gestão
──────────────
1. Abre Novo RH → Visão geral
2. Vê os números do dia (a trabalhar, faltas, atrasos, ausentes) e por centro
3. Clica numa pessoa → horário vs. entrada, últimos 7 dias, ligação à assiduidade
4. Clica num pendente → vai à caixa certa (aprovar ausências, correções, incidentes)
```

**Key concepts for the business:**

- **Falta** — tinha horário e não há marcação depois da hora de início (+ tolerância), sem ausência registada.
- **Atraso** — a primeira entrada foi depois da hora planeada + tolerância (configuração `attendance.*`).
- **Ainda não começou** — tem horário mas a hora de início ainda não chegou.

---

## Technical purpose

Só leitura, sem tabelas próprias. Junta, por colaborador ativo, o apuramento
da assiduidade (`AttendanceUseCases.board`, a mesma fonte das outras vistas —
RE-6) com ausências aprovadas, pendentes e feriados.

## Domain concepts

- `OverviewDay` — um dia apurado (teórico, trabalhado, início planeado, primeira entrada, atraso, registo aberto).
- `PersonStatus` — `working | remote | break | finished | absent | missing | not_started | day_off` (`classifyDay`).
- `Overview` — KPIs, pessoas (com os últimos 7 dias), resumo por centro, tendência da semana, pendentes, próximos feriados.

## Ports

### Input (use cases)

- `OverviewUseCases.get(org, viewer, date?)` — painel de um dia (hoje por omissão; futuro recusado). Âmbito RE-34 por pessoa (`viewer.canSee`); totais calculados só com as pessoas visíveis.

### Output (domain dependencies)

- `OverviewSourcesPort` — hoje no fuso da organização, colaboradores ativos, centros, dias apurados, ausências aprovadas, contagem de pendentes, próximos feriados. Ligado no `server.ts` aos módulos attendance, absences, people, workspace, alerts e time-base.

## Adapters

### Input

- `overview.controller.ts` → `GET /api/novo-rh/overview?date=AAAA-MM-DD` (`hr.overview`; `Cache-Control: no-store`). Em modo Demonstração mostra a organização fictícia (ADR-0034).

### Output

- Nenhum próprio (as fontes são casos de uso de outros módulos).

## Design decisions (ADR summary)

- Cache de 30 s por organização/dia no servidor: o apuramento custa vários pedidos por pessoa; 6 pessoas em paralelo.
- Ausências privadas aparecem com o nome genérico para quem não tem `hr.absences_private`.
- Sem aniversários: data de nascimento é dado pessoal e não é necessária para a gestão do dia (minimização, RGPD).

## How to test

- `npx jest --config jest.config.cjs src/modules/overview src/modules/attendance`

## Known gaps / open debt

- Para organizações grandes (centenas de pessoas) o primeiro pedido pode demorar; se for preciso, ler os dias gravados (`attendance_days`) em vez de apurar em direto.
