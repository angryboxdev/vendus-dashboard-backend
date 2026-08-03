# Módulo: cash-closings

> Status: ativo
> Última atualização: 2026-08-04

---

## O que é e para que serve (perspectiva de negócio)

No final de cada turno, o funcionário responsável pela caixa precisa de prestar
contas do dinheiro e das vendas do dia. Este módulo é o sistema que suporta
todo esse processo — desde o momento em que o funcionário introduz o PIN no
kiosk até ao momento em que o manager aprova ou rejeita o fecho no backoffice.

**O problema que resolve:**
Sem este sistema, o fecho de caixa seria feito em papel ou numa folha de cálculo,
sem rastreabilidade e sem histórico consultável. O manager não teria forma de
comparar automaticamente o que o funcionário declarou com o que o Vendus registou
(canal próprio) nem com o que o AirMenu registou (canais externos de delivery).
Qualquer divergência teria de ser investigada manualmente plataforma a plataforma.

**O fluxo do ponto de vista do negócio:**

```
Funcionário (kiosk)                         Manager (backoffice)
─────────────────────────────               ──────────────────────────────
1. Entra com PIN de 4 dígitos
2. Confirma a data do fecho
3. Selecciona a sessão de caixa
   do Vendus (turno da manhã /
   tarde / noite)
4. Regista o total TPA (Multibanco)
5. Regista totais das apps:
   Uber Eats, Glovo, Bolt, Eatz
6. Regista total de vendas a dinheiro
7. Conta nota a nota e moeda a moeda
   o que está na gaveta no fim do turno
8. Submete — o sistema vai buscar        →   9. Vê o fecho como "pendente"
   automaticamente o total Vendus             10. Vê diferenças por canal:
   (canal próprio) e os totais AirMenu             canal próprio (vs Vendus),
   por plataforma (Uber/Glovo/Bolt)                canais externos (vs AirMenu),
                                                    gaveta (esperada vs declarada)
                                            11. Confirma ou corrige valores
                                            12. Aprova ou rejeita
```

**Conceitos-chave para o negócio:**

- **Total calculado** — soma de todos os canais declarados pelo funcionário
  (TPA + Uber + Glovo + Bolt + Eatz + dinheiro). É a declaração total do turno.
- **Total Vendus** — o que o sistema de POS (Vendus) registou para aquela
  sessão de caixa. O sistema vai buscar este valor automaticamente para servir
  de referência ao manager.
- **Canal Próprio (Vendus)** — vendas faturadas no Vendus: TPA, Eatz e dinheiro.
  O `vendusTotal` é a referência automática para este canal.
- **Canais Externos (AirMenu)** — pedidos de delivery de plataformas externas
  (Glovo, Uber Eats, Bolt Food) faturados no AirMenu. Os `airMenuUber/Glovo/Bolt`
  são as referências automáticas para cada plataforma.
- **Diferença (canal próprio)** — `(tpa + eatz + cashSales) − vendusTotal`. Deve
  ser zero ou explicado. Uma diferença positiva pode indicar vendas não registadas
  no Vendus; negativa pode indicar um erro de registo.
- **Diferença (delivery)** — por plataforma e no total: valor declarado pelo
  funcionário menos total AirMenu. Útil para detetar erros de declaração ou
  discrepâncias nas plataformas externas.
- **Diferença de gaveta** — `(cashDrawerOpen + cashSales + cashIn − cashOut) − cashDrawerTotal`.
  Revela se falta ou sobra dinheiro na gaveta face ao esperado pela aritmética do
  turno. Calculada na UI; não persistida.
- **Sangria** — quando a gaveta tem mais de 100 € no fim do turno, o excesso
  deve ser retirado e colocado num envelope (a "sangria"). O sistema calcula
  automaticamente o valor a sangrar e alerta o funcionário no ecrã de confirmação.
- **Contagem de notas e moedas** — o funcionário regista quanto de cada
  denominação (50 €, 20 €, …, 1 cênt.) tem na gaveta. Isto serve de auditoria
  e evita erros de contagem.

---

## Propósito técnico

Gere o ciclo completo do fecho de caixa diário: submissão pelo funcionário no
kiosk, verificação cruzada automática com o Vendus (canal próprio) e com o
AirMenu (canais externos de delivery), e revisão/aprovação pelo manager no
backoffice. NÃO é responsável pela autenticação dos managers (feita pelo
middleware global), nem pelo agendamento de notificações.

## Conceitos do domínio

- **CashClosing** — entidade principal; imutável após criação, alterada via
  `review()` que devolve nova instância. Guarda os montantes declarados por canal
  (TPA, Uber, Glovo, Bolt, Eatz, dinheiro), os totais de referência AirMenu
  (`airMenuUber/Glovo/Bolt`), movimento de caixa (entradas/saídas, gaveta
  início/fim), a contagem física de denominações (`drawerDenominations`)
  e os campos derivados `totalCalculated` e `sangriaAmount`.
- **CashClosingStatus** — `"pending" | "approved" | "rejected"`.
- **CashClosingCalculator** — serviço de domínio puro com dois métodos estáticos:
  `computeTotal()` (soma dos canais) e `computeSangria()` (excesso de gaveta
  acima de 100 €, arredondado a 2 casas).
- **DrawerDenominations** — contagem física das notas e moedas na gaveta no fim
  do turno. Campos: `notes50/20/10/5`, `coins200/100/50/20/10/1`. Imutável após
  submissão — o manager não a pode alterar, pois é auditoria.
- **RegisterSession** — value object que representa uma sessão de caixa Vendus
  (abertura → fecho). Campos: `openedAt`, `closedAt` (null se ainda aberta),
  `total` (vendas da sessão já descontadas de notas de crédito NC).
- **Invariante de duplicado**: cada sessão Vendus só pode ter um fecho
  (identificado por `sessionOpenedAt`). Permite dois fechos no mesmo dia se
  forem sessões distintas (ex: turno manhã + turno tarde).

## Ports

### Entrada (use cases)

- `VerifyPinPort` — verifica o PIN de 4 dígitos do funcionário; devolve
  `{ employeeId, fullName }` ou lança `InvalidPinError`.
- `SubmitClosingPort` — funcionário submete o fecho com `sessionOpenedAt`; usa
  o total da sessão Vendus e impede duplicado por sessão. `vendusTotal` é
  best-effort: fica `null` se a API Vendus estiver indisponível.
- `GetAvailableSessionsPort` — lista sessões Vendus para uma data, anotando quais
  já têm fecho submetido no nosso sistema. Usado pelo kiosk antes de submeter.
- `ListClosingsPort` — lista fechos com filtros opcionais: `from`/`to` (intervalo
  de datas), `date` (atalho para `from=to=date`), `status`, `employeeId`,
  paginação `limit`/`offset`.
- `GetClosingPort` — detalhe de um fecho por ID; lança `ClosingNotFoundError`.
- `ReviewClosingPort` — manager aprova/rejeita e/ou edita valores; recalcula
  `totalCalculated` e `sangriaAmount` se campos numéricos mudarem; define
  `reviewedAt` se `status` mudar. Nunca altera `drawerDenominations` nem
  `airMenuUber/Glovo/Bolt` (ambos imutáveis após submissão).

### Saída (dependências do domínio)

- `CashClosingRepositoryPort` — `save`, `findById`, `list`, `update`,
  `existsForEmployeeOnDate`, `existsForSession`.
- `EmployeeRepositoryPort` — `findActiveByPinHash`, `findActiveById`.
- `VendusRegisterSessionsGatewayPort` — `getSessionsForDate(date)`, `getSessionTotal(date, openedAt)`.
- `AirMenuDeliveryGatewayPort` — `getDeliveryTotalsForDate(date)` → `{ uber, glovo, bolt }`.
  Opcional: se não configurado, os campos AirMenu ficam null.

## Adapters

### Entrada

- `CashClosingController` — expõe dois `Router` Express:
  - `publicRouter` → rotas sem auth:
    - `POST /cash-closings/verify-pin`
    - `POST /cash-closings/submit` — aceita `sessionOpenedAt?` e `drawerDenominations?`
    - `GET /cash-closings/sessions?date=` — lista sessões Vendus com flag `alreadySubmitted`
  - `managedRouter` → rotas com `requireAuth + requireMinRole("manager")`:
    `GET /cash-closings`, `GET /cash-closings/:id`, `PATCH /cash-closings/:id`.

### Saída

- `SupabaseCashClosingRepository` — implementa `CashClosingRepositoryPort`
  usando Supabase (service role). Faz join com `hr_employees` para popular
  `employeeName`. Persiste `drawer_denominations` como JSONB e `air_menu_uber/glovo/bolt`
  como numeric nullable; nenhum destes campos é atualizado no `update()` (imutáveis
  após submissão).
- `AirMenuDeliveryGateway` — implementa `AirMenuDeliveryGatewayPort`. Recebe
  `GetSummaryPort` (do módulo air-menu) e `enterpriseId` (env `AIRMENU_CLOSING_ENTERPRISE_ID`).
  Chama `getSummary` com `startOfDay/endOfDay` para a data do fecho e lê
  `analytics.byPlatform` para extrair os totais por plataforma (NCs já descontadas).
- `SupabaseEmployeeRepository` — implementa `EmployeeRepositoryPort` usando Supabase.
- `VendusRegisterSessionsGateway` — implementa `VendusRegisterSessionsGatewayPort`;
  chama `GET /registers/{id}/movements/` em paralelo com `GET /documents/` (FS+FT+NC)
  para calcular totais correctos por sessão. Instanciado com `registerId`
  (env `VENDUS_REGISTER_ID`).
- `session-builder.ts` — módulo puro (sem I/O) que implementa `buildSessions`:
  constrói sessões a partir dos movimentos e desconta NCs. Separado do gateway
  para ser testável sem dependências de infra.

## Decisões de design (ADR resumido)

**`CashClosing.review()` devolve nova instância (imutabilidade).**
Facilita testes (comparar antes/depois sem mock de estado) e elimina bugs de
mutação acidental. O custo é mínimo dado o tamanho da entidade.

**`hashPin` injectado como função no `VerifyPinUseCase`.**
O domínio não pode importar `crypto` ou utils de infra. A função de hash é
injectada pelo composition root, permitindo substituir por um fake em teste.

**`totalCalculated` e `sangriaAmount` calculados no domínio, não no adapter.**
Garante que a lógica de negócio não vaza para o repositório/BD. Os campos são
persistidos desnormalizados para facilitar queries e ordenação.

**`vendusTotal` é best-effort.**
A submissão não falha se a API Vendus estiver indisponível; `vendusTotal` fica
`null`. O manager pode comparar manualmente e editar via `ReviewClosingPort`.

**`airMenuUber/Glovo/Bolt` são best-effort e imutáveis.**
Calculados na submissão chamando `AirMenuDeliveryGatewayPort`. Se a API AirMenu
estiver indisponível ou o gateway não estiver configurado, ficam `null`.
Não são editáveis pelo manager (são dados externos, não declarados pelo funcionário).
O `SubmitClosingUseCase` recebe o gateway como 4.º parâmetro opcional.

**Separação canal próprio / canais externos.**
`vendusTotal` é a referência para TPA + Eatz + cashSales (Vendus).
`airMenuUber/Glovo/Bolt` são as referências para os respetivos canais de delivery.
`totalCalculated` continua a ser a soma de todos os campos declarados pelo funcionário.

**`drawerDenominations` é imutável após submissão.**
A contagem física de notas e moedas é auditoria — representa o que o funcionário
contou no momento do fecho. O manager pode corrigir montantes operacionais (TPA,
cashSales, etc.) mas não o que estava fisicamente na gaveta. O `review()` preserva
`this.drawerDenominations` e o repositório não inclui o campo no `update()`.

**Total de sessão = sum(vendas) − sum(NCs), não apenas sum(movements "in").**
A API de movements do Vendus não reflecte notas de crédito (NC) nos movimentos —
todos os movimentos `in` têm `type: "NU"`. O gateway busca em paralelo os
documentos FS+FT+NC do dia, constrói um mapa `doc_id → {type, amount}`, e
subtrai os NCs da sessão onde apareceram como `out` movement; NCs sem movimento
(ex: anulação de pagamento por cartão) são atribuídas à sessão única ou à última
sessão em dias multi-turno. Replica exactamente a lógica do dashboard:
`sum(FS/FT) - sum(NC)`.

**`from`/`to` em vez de só `date` no `ListClosingsPort`.**
Permite ao frontend carregar uma semana completa (Mon-Sun) ou um mês inteiro
numa única chamada, sem precisar de lógica de datas no adapter HTTP.

**`VendusRegisterSessionsGateway` recebe `registerId` no construtor, não via port.**
O `registerId` é config de infra (env var). O domínio não o conhece.
O port define apenas o comportamento (`getSessionsForDate`, `getSessionTotal`).

**`buildSessions` extraído para `session-builder.ts` (módulo puro).**
O gateway precisava de importar `vendusClient` e `documentsService` (infra), o que
impedia testes unitários directos à lógica de NC. Ao isolar a função pura num
ficheiro sem dependências de infra, os testes podem importá-la directamente.

## Como testar

- Domínio/use cases/adapters puros: `npx jest --config jest.config.cjs --testPathPattern=src/modules/cash-closings`
  (inclui `AirMenuDeliveryGateway` com fake `GetSummaryPort`)
- Adapters de infra (Supabase, Vendus API, AirMenu HTTP): testes de integração não incluídos (requerem staging).

## Pontos de atenção / dívidas conhecidas

- O `SupabaseCashClosingRepository.save()` insere o `submitted_at` gerado pelo
  domínio (em vez de deixar o DB gerar via `DEFAULT now()`). Garante consistência
  entre o estado em memória e a BD, mas pode haver pequena diferença de relógio
  se o servidor estiver desincronizado.
- `VendusRegisterSessionsGateway` não suporta sessões que atravessam meia-noite
  (ex: abertura às 23h, fecho à 01h do dia seguinte). Para o contexto actual
  (restaurante) é aceitável.
- NC sem movimento em dias multi-turno é atribuída à última sessão por heurística.
  Se um dia tiver NCs de múltiplos turnos sem movimento, o total da última sessão
  pode ficar ligeiramente errado. Casos raros no contexto actual.
- `AirMenuDeliveryGateway` filtra por `orderDate` (data de criação da ordem), não
  por `documentDate`. Ordens aceites próximo da meia-noite podem cair no dia
  seguinte se a criação e a faturação ocorrerem em dias diferentes.
- Os totais AirMenu (`airMenuUber/Glovo/Bolt`) reflectem apenas a enterprise
  configurada em `AIRMENU_CLOSING_ENTERPRISE_ID`. Se o negócio tiver múltiplas
  localizações com enterprises distintas no AirMenu, os totais serão incompletos.
- A diferença de gaveta é calculada apenas na UI e não é persistida. Não pode
  ser usada para filtrar ou ordenar fechos no backoffice.
