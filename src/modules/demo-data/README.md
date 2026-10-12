# Module: demo-data

> Status: active
> Last updated: 2026-10-11

---

## What it is and what it's for (business perspective)

Gera dados **fictícios** de RH (organizações, centros, funcionários, horários
e marcações de ponto) para a organização de demonstração do "Novo RH" — para
testar e mostrar o sistema sem tocar em dados reais (RGPD, task RH §4.3).

**The problem it solves:**
Sem dados de teste realistas não se prova a assiduidade (meia-noite, mudança
de hora, PT vs ES) nem se mostra o produto sem expor colaboradores reais.

**The flow from the business's point of view:**

```
Equipa técnica                        Quem testa / demonstra
──────────────────────               ──────────────────────
1. npm run demo:generate
2. Carrega na org. de demonstração →  3. Vê funcionários, escalas
   (Fase 1+)                              e marcações fictícias
```

**Key concepts for the business:**

- **Organização de demonstração** — organização separada da real, só com dados fictícios; nunca recebe dados reais.
- **Semente** — número que fixa o conjunto: a mesma semente gera sempre os mesmos dados.

---

## Technical purpose

Gerador determinístico e puro (`generateDemoDataset`) mais um destino
trocável. Fase 0: escreve um ficheiro JSON local (`.demo/`, fora do git).
**Não** escreve em nenhuma base de dados.

## Domain concepts

- `DemoDataset` — 2 organizações, 4 centros (PT `Europe/Lisbon`, ES `Europe/Madrid`), cargos, horários-modelo (incl. noturno e fecho depois da meia-noite), funcionários e marcações em UTC com o fuso do centro e `workDate` (dia de início do turno).
- Invariantes: tudo `synthetic: true`; e-mails `@demo.invalid` (RFC 6761); sem NIF/NISS/IBAN/morada; `clientEventId` único por marcação.
- **Sem valores legais** (feriados, limites, férias) — são configuração com `a_validar = true` (task RH §4.5).

## Ports

### Input (use cases)

- `GenerateDemoDatasetPort` — valida as opções, gera e entrega ao destino; devolve um resumo.

### Output (domain dependencies)

- `DemoDatasetSinkPort` — recebe o conjunto e devolve onde ficou.

## Adapters

### Input

- `demo-data.cli.ts` → `npm run demo:generate -- --seed 42 --per-center 40 --from 2026-10-19 --to 2026-11-01 --out .demo/dataset.json`.

### Output

- `JsonFileDemoDatasetSink` → ficheiro JSON local.

## Design decisions (ADR summary)

- O período por defeito atravessa a mudança de hora de 25/10/2026 (TK-12).
- A carga na base de dados fica para quando o modelo novo do RH tiver tabelas: carregar agora nas tabelas antigas seria deitado fora. A organização de demonstração só existe em local/staging até fechar o bloqueio da 2.ª organização em produção — ADR-0021.

## How to test

- Domain/use cases: `npx jest --config jest.config.cjs src/modules/demo-data`.

## Known gaps / open debt

- Falta o carregador para a organização de demonstração (Fase 1+).
- Ausências, correções e banco de horas ainda não são gerados (entram com as fases 4–6).
