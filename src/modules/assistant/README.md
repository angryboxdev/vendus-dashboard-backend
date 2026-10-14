# Module: assistant

> Status: active
> Last updated: 2026-10-14

---

## What it is and what it's for (business perspective)

O **Assistente Mezza** é um chat (texto ou voz) dentro de Escalas & Turnos.
Responde a perguntas sobre a escala ("quem trabalha hoje?", "quem pode
substituir a Maria?", "há turnos sem cobertura?") e faz alterações em turnos
não publicados ("coloca o João amanhã das 9h às 17h", "preenche a
cobertura desta semana") — sempre com as mesmas regras do ecrã.

**The problem it solves:**
Planear à mão muitas pessoas e dias é lento; o gestor quer pedir em linguagem
natural sem perder as validações, as permissões nem o "Desfazer".

**The flow from the business's point of view:**

```
Gestor                                   Sistema
──────────────────────                 ──────────────────────
1. "Coloca o João sexta de manhã"   →   2. Há dois João → "Qual João?"
3. "João Silva"                     →   4. Valida (sobreposição, regras) e cria
                                        5. "✓ João Silva — sexta-feira, 09:00–17:00"
6. Desfazer                          →   7. Reverte o lote inteiro
```

## Technical purpose

A IA interpreta; o backend valida e executa. O caso de uso corre um ciclo de
ferramentas (allowlist em `tools.ts`) contra a `SchedulingPort`, implementada
no composition root com os serviços canónicos (rosters, time-base,
ausências, pessoas). Não há segundo motor de escalas, conflitos, cobertura,
permissões ou Desfazer. O assistente nunca publica.

## Domain concepts

- **Refs curtas** (`e1`, `s1`, `m1`) — a IA nunca vê ids internos; o servidor
  traduz em cada pedido.
- **ChangePlan** — uma alteração lógica = retirar turnos pendentes + criar
  turnos (editar/mover/substituir/trocar = retirar + criar), o mesmo modelo
  do Desfazer manual.
- **Confirmação** — pedidos grandes ou destrutivos (≥ 5 remoções, ≥ 15
  alterações, remoções em ≥ 4 pessoas, limpar pendentes) devolvem um resumo
  e um token (10 min, só para quem pediu). Ao confirmar, se a escala mudou,
  recalcula e volta a perguntar.
- **Factos** — linhas determinísticas do que o servidor fez (não dependem do
  texto da IA).

## Ports

### Input (use cases)

- `AssistantUseCases.chat` — conversa (consultas e alterações).
- `AssistantUseCases.confirm | cancel` — confirmar/cancelar uma alteração grande.
- `AssistantUseCases.transcribe` — voz → texto editável (áudio não é guardado).

### Output (domain dependencies)

- `LlmPort` — modelo de linguagem (formato neutro de mensagens e ferramentas).
- `TranscriberPort` — voz → texto.
- `SchedulingPort` — Escalas vistas pelo assistente (consultas, disponibilidade, cobertura, criar/retirar/repor, modelos).
- `AssistantAuditPort` — auditoria (`source: AI_AGENT`, comando, ação estruturada, ids, resultado; sem raciocínio, sem áudio).

## Adapters

### Input

- `createAssistantRouter` → `/api/novo-rh/assistant/{status,chat,confirm,cancel,transcribe}` (`hr.schedules` READ; alterar exige MANAGE no caso de uso). `chat/confirm/cancel` com `Idempotency-Key` obrigatório.

### Output

- `OpenAiLlmAdapter` / `OpenAiTranscriberAdapter` → OpenAI (dependência e `OPENAI_API_KEY` já existentes; modelos `ASSISTANT_MODEL` — por omissão `OPENAI_MODEL_TEXT` — e `ASSISTANT_TRANSCRIBE_MODEL`, por omissão `gpt-4o-mini-transcribe`).
- `SchedulingPort` implementada em `server.ts` com `rosters.addShifts` (lote), `rosters.availability`, `clearPending`/`restoreShifts`, `check`, `createTemplate`, `time-base.theoretical` + `plannedFor` (cobertura).

## Design decisions (ADR summary)

- ADR-0038: allowlist de ferramentas sobre serviços canónicos; plano = retirar + criar (Desfazer único); confirmação por limiares com token em memória; IA atrás de uma porta (OpenAI hoje); só nomes e cargos chegam à IA; ausências como "Indisponível".

## How to test

- `npx jest --config jest.config.cjs src/modules/assistant` (IA com guião e Escalas em memória; HTTP com express em memória).
