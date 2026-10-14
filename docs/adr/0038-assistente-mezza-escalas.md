# Assistente Mezza nas Escalas: IA interpreta, backend valida e executa

Decidido em 2026-10-14 (Task "Assistente IA Mezza para Escalas & Turnos";
o utilizador pediu para seguir as opções recomendadas até ao fim).

## Contexto

A task pede um chat (texto e voz) que consulta e altera a escala com as
mesmas regras, permissões e Desfazer do ecrã, sem criar arquitetura
paralela, e que nunca bloqueia as Escalas se a IA falhar.

## Decisões

- **Fornecedor**: OpenAI, atrás de `LlmPort`/`TranscriberPort`. O projeto já
  tem a dependência `openai` e `OPENAI_API_KEY` (faturas); não se acrescentam
  dependências. Trocar de fornecedor = novo adaptador.
- **Allowlist de ferramentas** (`tools.ts`), cada uma sobre um serviço
  canónico. Não há `UPDATE_SHIFT_MODEL` (não existe serviço de alteração de
  modelos) nem nada que publique: `START_PUBLISH` só devolve o resumo e o
  ecrã abre o fluxo de publicação existente.
- **Serviços novos nas Escalas** (canónicos, reutilizáveis pela UI):
  `addShifts` (vários turnos numa operação, mesma validação de sobreposição,
  um registo de auditoria) e `availability` (o motor de restrições aplicado a
  um turno hipotético, sem gravar).
- **Plano = retirar pendentes + criar**: editar horas, mover, substituir e
  trocar exprimem-se assim — exatamente o que o Desfazer manual já sabe
  inverter (`clearPending`/`restoreShifts`). Cada resposta devolve o lote
  aplicado; o ecrã regista-o como uma entrada "Assistente Mezza" no mesmo
  histórico. Se criar falhar depois de retirar, o servidor repõe o retirado.
- **Turnos publicados**: só consulta. Alterá-los continua no ecrã (motivo +
  publicação imediata, TK-16).
- **Confirmação** por limiares (≥ 5 remoções, ≥ 15 alterações, remoções em ≥ 4
  pessoas, limpar pendentes). Token em memória do processo (10 min, só para
  quem pediu). Ao confirmar compara a impressão dos turnos a retirar e a versão
  da escala; se mudou, recalcula e pergunta outra vez. Com várias instâncias
  o token só vale na que o emitiu (aceitável: expira e pede-se de novo).
- **Segurança**: a IA não é autoridade. Rota exige `hr.schedules` READ;
  escrever exige MANAGE no caso de uso; âmbito (RE-34) filtra os
  colaboradores; o contexto (escala, período) é revalidado no servidor;
  comandos fora da allowlist são recusados.
- **Privacidade**: à IA chegam refs curtas (`e1`, `s1`), nomes, cargos e
  horas — nunca ids internos, NIF, salário, moradas. Ausências aparecem como
  "Indisponível (ausência aprovada)", sem motivo. O áudio vai só para a
  transcrição e não é guardado.
- **Idempotência**: `chat`, `confirm` e `cancel` exigem `Idempotency-Key`
  (store existente); retry ou duplo clique devolvem a mesma resposta.
- **Falhas**: erro do fornecedor → resposta normal "temporariamente
  indisponível"; o que já foi feito nesse pedido é reportado. As Escalas não
  dependem do assistente (carregado só ao abrir).

## Consequências

- Cada pedido faz até 6 chamadas ao modelo (custo por pedido limitado).
- O texto da IA pode errar no tom, mas os factos ("✓ … criado") vêm do
  servidor; o ecrã mostra-os.

## Adenda (2026-10-14) — Gemini

A pedido do utilizador, o assistente também funciona com Google Gemini
(`GeminiLlmAdapter`, HTTP direto, sem dependências novas). O fornecedor é
escolhido por variáveis de ambiente (`ASSISTANT_PROVIDER`, `GEMINI_API_KEY`,
`GEMINI_MODEL`); o domínio e os casos de uso não mudam. A transcrição de voz
usa o mesmo modelo (áudio em linha, não guardado). Recomendação RGPD: usar uma
chave de um projeto Google Cloud com faturação ativa — verificar nos termos
do Gemini API que, nesse regime, o conteúdo não é usado para melhorar produtos.
