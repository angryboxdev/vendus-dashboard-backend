# Module: stock-count

> Status: active
> Last updated: 2026-09-30

---

## O que é e para que serve (perspectiva de negócio)

O botão "Atualizar stock" era um lançamento manual de deltas (+/-) por
linha — quem contava tinha de saber e calcular o ajuste sozinho, sem
nenhuma noção de "quanto o sistema espera" vs. "quanto existe fisicamente".
Este módulo substitui esse botão por uma engine genérica de contagem física:
define o escopo (que itens contar), materializa o stock teórico no momento
de iniciar, regista tentativas de contagem, compara com a tolerância
configurada, sinaliza divergências para recontagem/revisão humana e só gera
o ajuste real de stock quando um admin confirma explicitamente.

**O problema que resolve:**
Sem isto, contar o stock físico dependia inteiramente de a pessoa calcular
manualmente a diferença e lançar o ajuste certo — sem rasto de qual foi o
teórico no momento da contagem, sem conferência, sem forçar decisão humana
sobre divergências grandes.

**O fluxo do ponto de vista do negócio:**

```
Gestor de Stock                              Sistema
────────────────────────────────────        ──────────────────────────────
1. Cria sessão (tipo, escopo, loja)
2. Inicia a contagem              →   3. Materializa o stock teórico por item
4. Conta cada item (unidade base
   ou alternativa: "saco", "caixa") →   5. Compara contado vs. teórico,
                                          aplica tolerância (item→categoria→
                                          empresa), sinaliza recontagem
6. Recontagem se necessário / gestor
   revê e resolve divergências
7. Marca sessão "Pronta"
                                     →   8. Admin confirma
                                          "Confirmar contagem e ajustar stock"
                                     →   9. Gera 1 movimento AJUSTE_CONTAGEM
                                          por linha com diferença ≠ 0
```

**Conceitos-chave para o negócio:**

- **Sessão de contagem** — um evento de contagem física, com escopo fixo
  desde que é iniciada (não muda a meio, exceto item "não previsto",
  sempre auditado).
- **Tentativa** — um registo imutável de "contei X, o sistema esperava Y,
  neste momento". Recontar nunca apaga a tentativa anterior — cria uma
  nova.
- **Tolerância** — a partir de que diferença uma divergência exige
  recontagem antes de fechar a sessão. Configurável por item, categoria ou
  para a empresa toda.
- **AJUSTE_CONTAGEM** — o movimento de stock real, só criado quando um
  admin confirma a sessão. Nunca antes disso.

---

## Propósito técnico

Motor de contagem física genérico: escopo → materialização → tentativas →
conferência/recontagem → resolução → confirmação atómica. Escreve
diretamente nas tabelas legacy `stock_items`/`stock_movements`/
`stock_categories` através dos seus próprios adapters — nunca via
`src/services/stockItemService.ts`/`stockMovementService.ts`
(CLAUDE.md: nunca imitar/estender um módulo legacy). **Não é
responsabilidade deste módulo nesta fase**: interface de mockups completa
(fase 1 é funcional simples), reversão de uma sessão já confirmada (correção
só por nova sessão), qualquer ligação a `invoices`/`financial-base`/
`stock-purchase-review` (nenhuma existe nem é necessária).

## Domain concepts

- **`StockCountSession`** — aggregate root. Estados exatamente
  `draft|counting|reviewing|ready|completed|cancelled`. `create()` só
  define o escopo — nunca materializa linhas (isso só acontece em
  `start()`, via RPC). Terminal em `completed`
  (`SessionAlreadyCompletedError` depois disso). `cancel(reason)` exige
  motivo, só antes de `completed`, nunca hard delete.
- **`StockCountLine`** — uma por item (`UNIQUE(session_id, item_id)`).
  Estados `not_counted|counted|recount_required|resolved`. Sem método que
  sobrescreva `finalCountedQuantity` diretamente — só nova tentativa ou o
  gestor a escolher explicitamente (`resolveBySelectingAttempt`) ou definir
  valor manual (`resolveManually`, motivo obrigatório, admin only). Lease
  (`lockedBy`/`lockedAt`) — só uma indicação de UI, nunca a garantia de
  integridade (essa é `version`).
- **`StockCountAttempt`** — imutável depois de criada. Guarda o SEU
  PRÓPRIO `systemQuantityAtCount`/`ledgerVersionAtCount` — recontagens
  nunca comparam números brutos entre tentativas diferentes.
- **`StockCountComponent`** — um "pedaço" de uma tentativa numa unidade
  (base ou alternativa) e opcionalmente numa zona; `baseQuantity` sempre
  calculado no domínio, nunca confiado ao cliente.
- **`tolerance.service.ts`** — `resolveTolerance(...)`, hierarquia item →
  categoria → empresa, **bloco completo por nível**, nunca merge
  campo-a-campo. `null` quando nenhum nível define nada.
- **`variance.service.ts`** — `computeVariance`/`computeFinancialImpact`/
  `breachesTolerance`; `percent` sempre `null` quando o teórico é `<= 0`,
  nunca `Infinity`/`NaN`; impacto financeiro `null` sem custo unitário
  confiável.
- **`unit-conversion.service.ts`** — soma múltiplas unidades de contagem
  sempre em unidade base.

## Ports

### Input (use cases)

- `CreateCountSessionPort` — Rascunho: só escopo.
- `StartCountSessionPort` — materializa via RPC, bloqueia sobreposição
  (exceto override admin).
- `SubmitCountAttemptPort` — regista tentativa via RPC.
- `RequestRecountPort` — recontagem manual (motivo opcional).
- `ResolveCountLinePort` — `select_attempt` ou `manual_value` (admin only).
- `FinishExecutionPort`/`MarkSessionReadyPort` — validam linhas antes de
  avançar.
- `ConfirmCountSessionPort` — admin only, aplica AJUSTE_CONTAGEM via RPC,
  idempotente.
- `CancelCountSessionPort` — motivo obrigatório.
- `ListCountSessionsPort`/`GetCountSessionPort` — leitura.
- `AddUnscopedItemToSessionPort` — "item não previsto", sempre auditado.
- `ListCountZonesPort`/`CreateCountZonePort` — CRUD simples.

### Output (domain dependencies)

- `StockCountRepositoryPort` — sessões/linhas/tentativas/componentes.
- `StockCountZonePort`/`StockCountSettingsPort` — zonas e configuração da
  empresa.
- `StockCountAuditLogPort` — mirror de `StockReviewAuditLogPort`.
- `StockMovementWritePort` — as 3 RPCs `plpgsql`.
- `StockItemCatalogPort` — lê/cria `stock_items`, tolerância por item,
  unidades alternativas.
- `StockCategoryReadPort` — adapter direto à tabela LEGACY
  `stock_categories` (nunca D10 sobre `financial-base` — Centro de Custo é
  outro conceito).
- `LocationReadPort` — D10, mesmo `ListLocationsPort` de `locations`.

## Adapters

### Input

- `StockCountController` → `/api/stock-count/*`, `requireMinRole("manager")`
  no mount; checks inline de `admin` no próprio controller para confirmar,
  forçar sobreposição e definir valor final manual.

### Output

- `SupabaseStockCountRepository` → `stock_count_sessions`/`_lines`/
  `_attempts`/`_components`.
- `SupabaseStockCountZoneRepository` → `stock_count_zones`.
- `SupabaseStockCountSettingsRepository` → `stock_count_settings`.
- `SupabaseStockCountAuditLogAdapter` → `stock_count_audit_logs`.
- `SupabaseStockMovementWriteAdapter` → `fn_stock_count_start_session`/
  `fn_stock_count_submit_attempt`/`fn_stock_count_confirm`.
- `SupabaseStockItemCatalogAdapter` → `stock_items` +
  `stock_item_count_units`.
- `SupabaseStockCategoryReadAdapter` → `stock_categories` (legacy).
- `LocationsReadAdapter` — tradução D10.

## Design decisions (ADR summary)

### Resolução de tolerância: bloco completo por nível, nunca merge

`resolveTolerance` devolve o primeiro nível não-nulo **inteiro** (item,
senão categoria, senão empresa, senão `null`). Nunca mistura campos de
níveis diferentes — uma política "meio item, meio categoria" seria confusa
de auditar e poderia produzir um resultado que ninguém configurou
explicitamente.

### Lease vs. lock otimista — dois mecanismos com responsabilidades diferentes

`StockCountLine.lockedBy`/`lockedAt` é avaliado preguiçosamente (sem
cron/worker) e serve só de indicação de UI ("Ana está a contar este item");
expira sozinho ao fim de 5 minutos, sem processo de limpeza. A garantia de
integridade real é sempre `version` — um `UPDATE ... WHERE version = $`
que afeta 0 linhas é o único sinal confiável de conflito. Isto significa
que, tecnicamente, nada impede duas pessoas de submeterem quase ao mesmo
tempo; a segunda simplesmente recebe `StaleCountLineVersionError` e tem de
recarregar. O lease só reduz a chance de isso acontecer, nunca a garante.

### `ledgerVersionAtCount`: fingerprint local, não sequência global

Não existe nesta base de código nenhuma sequência global de movimentos de
stock. `ledgerVersionAtCount` é um `COUNT(*)` de `stock_movements` para
aquele item+local até ao momento em que a contagem começou
(`count_started_at`); ao terminar a tentativa, o mesmo `COUNT(*)` é
recalculado até `now()` — se divergir, houve pelo menos um movimento no
intervalo. **Qualquer** movimento detetado força recontagem
incondicionalmente (nunca se tenta adivinhar se a magnitude "importa"), a
mesma decisão já documentada no `stock-purchase-review` para outros
cenários de deteção de concorrência: mais simples e mais seguro do que
tentar ser esperto.

### Resolução de tolerância acontece em TS antes da RPC; a decisão final acontece dentro da RPC

`tolerance.service.ts`/`variance.service.ts` são funções puras, testadas
diretamente (`__tests__/domain/`) e usadas de duas formas: (1) o use case
resolve a tolerância aplicável (item→categoria→empresa) e o impacto
financeiro esperado **antes** de chamar `fn_stock_count_submit_attempt`,
porque essa resolução não depende de nenhum estado vivo da BD; (2) a RPC
recebe esse `tolerance_snapshot` já resolvido como parâmetro e aplica a
mesma fórmula de variância em SQL para decidir o estado final da linha
(`counted` vs. `recount_required`) — porque `system_quantity_at_count` só é
conhecido dentro da própria transação (soma viva de `stock_movements`), e
`plpgsql` não pode chamar de volta para TypeScript. As duas implementações
(TS e SQL) seguem deliberadamente a mesma fórmula documentada
(`variance.service.ts`), e os fakes de teste (`FakeStockMovementWrite`)
reusam as funções TS diretamente para simular fielmente o que a RPC real
faz — nunca duas lógicas independentes que podem divergir silenciosamente.

### `zoneIds` no escopo é só informativo nesta ronda

Não existe hoje uma tabela de associação item↔zona — zonas são "puramente
organizacionais" (nunca uma dimensão de saldo de stock, confirmado pela
task original). Por isso, `StartCountSessionUseCase` materializa o escopo
usando só `categoryIds`/`itemIds`; `zoneIds` fica guardado em
`scope_definition` (para a UI mostrar "esta sessão cobre estas zonas"), mas
nunca filtra quais itens entram na sessão. Zonas só entram em jogo mais
tarde, como campo opcional de cada `StockCountComponent` (onde o item foi
fisicamente contado).

### "Item não previsto" nunca verifica sobreposição

Adicionar um item a uma sessão já iniciada (secção 57) é sempre auditado,
mas não repete a verificação de sobreposição de `start()` — essa é
deliberadamente só uma preocupação do momento de materializar o escopo
inicial. Um item adicionado manualmente a meio da contagem é uma decisão
humana explícita e já auditada; exigir também motivo/override de
sobreposição nesse ponto pareceu fricção desnecessária sem o pedido
explícito da task.

### `resolveManually` sem tentativa anterior é rejeitado

A resolução manual de valor final (secção 36) exige que a linha já tenha
`finalSystemQuantity` conhecido de uma tentativa anterior — nunca inventa
um teórico do nada. Na prática isto significa que só se pode "forçar" um
valor final numa linha que já foi contada pelo menos uma vez (normalmente
`recount_required`).

### Sem RBAC novo — 3 checks inline no controller

A task permite explicitamente reaproveitar os 3 papéis existentes. Em vez
de introduzir uma tabela de permissões granulares, o `StockCountController`
faz 3 checks inline (`req.auth.orgRole === "admin"`) exatamente nos 3
pontos que a task pede: confirmar sessão, forçar início apesar de
sobreposição, definir valor final manual — mesmo padrão já usado no módulo
`hr` para writes mistos dentro de uma rota `manager`.

## Como testar

- `npx jest src/modules/stock-count` (suite completa com fakes; o
  `FakeStockMovementWrite` muta o MESMO `FakeStockCountRepository`
  injetado, nunca um estado independente — lição já aprendida no módulo
  irmão `stock-purchase-review`).
- Testes de integração (Supabase real) para as 3 RPCs — concorrência real
  na materialização, stale-version na submissão de tentativa, duplo-call
  concorrente + already-completed na confirmação — ficam pendentes desta
  ronda (ver Known gaps).

## Known gaps / open debt

- **Testes de integração das 3 RPCs** (Supabase real) — esta ronda cobre
  os use cases com fakes; a validação da transação `plpgsql` em si
  (`FOR UPDATE`, concorrência real) fica para uma próxima ronda, mesmo gap
  já documentado no `stock-purchase-review`.
- **`zoneIds` como filtro de escopo** — não existe tabela item↔zona; se o
  negócio vier a precisar de "contar só os itens desta zona" como critério
  de escopo (não só como metadado do componente), isso exige uma tabela
  nova de associação, fora do desenhado nesta ronda.
- **`max_recounts`** (`StockCountSettings`) existe no schema e no port mas
  não é lido nem aplicado por nenhum use case — não há ainda nenhum ponto
  que bloqueie uma recontagem além do limite configurado; a task não
  especificou o comportamento exato ao atingir o limite (bloquear? só
  avisar?), por isso ficou como campo de configuração sem efeito nesta
  ronda.
- **`slow_moving_days_threshold`** (`stock_count_settings`) — coluna
  aditiva nova (migration do módulo `stock-planning`,
  `20260930120000_stock_planning_tables.sql`), nullable, **não exposta
  neste módulo** (nem em `StockCountSettingsPort`/`CompanyCountSettings`,
  nem no controller) porque só é lida por `stock-planning`
  (`StockCountSignalReadAdapter`, direto por `ScopedQuery`) para detetar
  item parado/excesso de stock — este módulo continua sem nenhum
  comportamento de "slow moving" próprio. Reaproveita esta tabela em vez
  de criar uma 3ª tabela de configurações, por já ser "as definições da
  empresa sobre stock" mais próxima do conceito (ver README de
  `stock-planning`).
- **Fase 2 (mockups completos)** — o frontend fica para uma ronda seguinte
  (fase 1 = backend completo + UI funcional simples, mesma decisão já
  confirmada com o utilizador na task Financeiro→Stock).
