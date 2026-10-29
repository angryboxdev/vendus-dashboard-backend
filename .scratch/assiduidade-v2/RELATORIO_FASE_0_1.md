# Assiduidade V2 — Fase 0 (auditoria) e Fase 1 (pré-visualização)

Estado: **pré-visualização isolada, à espera de aprovação**. Nada foi integrado no `rh`, nada foi commitado, nada tocou produção.

## 1. Auditoria — o que existe hoje

| Peça | Onde | Decisão |
|---|---|---|
| Picagens originais (append-only, trigger) | backend `attendance` · `clock_events` | **Reutilizar** — nunca são reescritas |
| Motor de cálculo (tolerância, arredondamento, pausas, noturnos, D8) | `attendance/domain/services/day-engine.ts` › `computeDays` | **Reutilizar** — fonte única |
| Revisões (add/update/void, motivo, autor, recusa RE-11) | `attendance.use-cases.ts` › `revise`/`createRevision` | **Reutilizar** para «Corrigir manualmente» |
| Incidentes (`missing_in/out`, `auto_closed`, `late`) e resolução | `resolveIncident` | **Ajustar** — passam a ser fonte da fila «Pendências» |
| Pedidos de correção (aprovação multinível) | `decideCorrection` | **Manter** (só sai da navegação principal; endpoints ficam) |
| Fecho/reabertura e bloqueio `period_closed` | módulo `periods` · `assertOpen` | **Reutilizar** |
| Escala publicada → planeado | `rosters.plannedFor` → `server.ts` `plannedDays` | **Ajustar** — hoje perdem-se `plannedRanges`, a origem (escala/horário fixo) e o motivo (`no_schedule`, `rest_day`…) |
| Ausências «assign» (auto-aprovadas) | `POST /novo-rh/absences/requests` | **Reutilizar** — falta *hook* para recalcular a assiduidade |
| Ações rápidas atraso/falta (commit 0cae7a0) | frontend `DayQuickActions.tsx` + `day-actions.service.ts` | **Descontinuar na navegação** — substituídas pelo painel único |
| Sub-separadores Dia da equipa / Dias / Incidentes / Pedidos / Pausas | frontend `AttendanceView.tsx` (estado local) | **Reorganizar** em Semana · Dia · Pendências; «Pausas» (tipos) passa para Configurações ou fica acessível no detalhe |
| Separadores Registos de ponto / Banco de horas / Fecho / Relatórios | `screens.registry.ts` | **Manter** |

### Lacunas para a V2 (precisam de backend na Fase 3)
1. **«Cumpriu o horário planeado» não existe como comando.** Hoje é simulado no frontend com várias revisões seguidas (não atómico, conta o intervalo de um repartido como trabalho). → comando no servidor que use os **segmentos publicados** do dia.
2. **Não existe estado «revisto»** por dia. → entidade nova de decisão de conferência (quem, quando, decisão, abrangência, motivo, valores antes/depois, versão).
3. **Não há endpoint equipa × semana** (o `/days` é por colaborador). → endpoint de leitura da semana para a vista Semana.
4. **Sem lote nem pré-visualização no servidor.** → caso de uso que devolve `aptos / já conformes / excluídos / revisão individual` com motivo (padrão do «copiar semana» das escalas) e aplica numa só operação, idempotente.
5. **Revisões sem controlo de versão** (dois gestores podem empilhar). → versão esperada por dia.
6. Ausência registada não dispara recálculo da assiduidade.

### Decisão por tomar (recomendação)
Para «Cumpriu o horário» há duas vias:
- **A — revisões geradas a partir dos segmentos** (sem migração; reaproveita tudo; mas o colaborador pode recusar a revisão — RE-11 — e a decisão do gestor fica «escondida» em revisões).
- **B — decisão de conferência com tempo validado por dia** (migração nova + o motor usa o validado quando existe; separa claramente picagem / planeado / decisão / tempo validado, como a task pede).

**Recomendo B**, porque é a única que cumpre «quatro conceitos que não se misturam» e dá o estado «Revisto» sem truques. Custo: migração (idempotente, com rollback) e ajuste ao `computeDays`/relatórios.

## 2. Pré-visualização (Fase 1)

- Worktree: `C:\Users\Bruno Fontes\vendus-dashboard-frontend-preview-assiduidade` (ramo `preview/assiduidade-v2`, a partir do `rh`).
- Link local: **http://localhost:5174/assiduidade.html** (`?bare=1` sem moldura). Dados 100% fictícios; **não chama a API nem a BD**.
- Arrancar: na worktree, `VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=teste-ficticio npx vite --config .preview/vite.config.ts`.

### Ficheiros (todos novos; nenhum ecrã existente alterado)
- `src/modules/novo-rh/domain/entities/attendance-review.ts` — conceitos (dia, decisão, abrangência, motivos de exclusão).
- `src/modules/novo-rh/domain/services/attendance-review.service.ts` (+ teste) — estado do dia e elegibilidade de cada decisão.
- `src/modules/novo-rh/adapters/in/attendance/conference/` — `ConferenceView` (Semana · Dia · Pendências), `WeekGrid`, `ReviewDrawer` (painel único), `review-ui.ts` (textos).
- `.preview/assiduidade.tsx|html` — página de pré-visualização (não versionada).

### Percursos
- **Um dia:** clicar na célula (Semana) ou «Rever» (Dia/Pendências) → painel com «Este dia».
- **Semana de um colaborador:** caixa da linha → «Rever seleção», ou no painel de um dia mudar a abrangência para «Semana inteira».
- **Equipa em lote:** selecionar linhas/dias (ou «todos os visíveis») → «Rever seleção» → aptos / já conformes / excluídos / revisão individual, com possibilidade de desmarcar dias → um só «Confirmar».

«Cumpriu o horário planeado» aparece **só** no painel. Na tabela, na barra e no rodapé só existem «Rever», «Rever seleção» e «Confirmar correção»/«Guardar revisão».

### Exclusões e bloqueios
Período fechado · turno em curso · dia futuro · folga/feriado · ausência aprovada · sem escala publicada · trabalho sem escala (exceção de planeamento) · sem picagens (só dia a dia, com declaração) · só uma picagem (só dia a dia) · trabalhou além do planeado (horas reais preservadas) · correção manual (só dia a dia) · já conforme · já revisto.

### Testes
- `attendance-review.service.test.ts` (14 testes): casos 6–14 e 20 da task, folgas, ausências, duplicados e resumo semanal.
- Typecheck e eslint sem erros; testes de assiduidade existentes continuam verdes.

### Por cobrir só na integração (Fase 3)
Casos 15–19 da task (viragem do dia com picagens reais, hora de verão, concorrência entre gestores, reabertura, coerência com Relatórios/Fecho) dependem do motor e do servidor; a pré-visualização não os simula.

## 3. Diferenças em relação à task
- Os mockups referidos não vieram anexados; a interface segue o texto da task e o Design System Mezza.
- «Tipos de ausência» e «motivos padrão» estão fixos na pré-visualização; na integração vêm das Ausências e da política atual.
- Tolerância fixa em 5 min na pré-visualização; na integração vem da política da empresa/centro.
