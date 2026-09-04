# Módulo: cash-closings

> Status: ativo
> Última atualização: 2026-09-04

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
8. Revê o resumo antes de submeter:
   vê Total Vendus (da sessão Vendus
   selecionada), Total AirMenu (buscado
   à API AirMenu neste momento) e as
   respetivas diferenças por canal
9. Submete — o sistema persiste os      →  10. Vê o fecho como "pendente"
   totais de referência AirMenu              11. Vê diferenças por canal:
   por plataforma (Uber/Glovo/Bolt)              canal próprio (vs Vendus),
                                                  canais externos (vs AirMenu,
                                                  por plataforma e no total),
                                                  gaveta (esperada vs declarada)
                                           12. Confirma ou corrige valores
                                           13. Aprova ou rejeita
```

**Conceitos-chave para o negócio:**

- **Total calculado** — soma de todos os canais declarados pelo funcionário
  (TPA + Uber + Glovo + Bolt + Eatz + dinheiro). É a declaração total do turno.
- **Total Vendus** — o que o sistema de POS (Vendus) registou para aquela
  sessão de caixa. O sistema vai buscar este valor automaticamente para servir
  de referência ao manager.
- **Canal Próprio (Vendus)** — vendas faturadas no Vendus: TPA, Eatz e dinheiro.
  O `vendusCalculated` é o subtotal declarado pelo funcionário para este canal;
  o `vendusTotal` é a referência automática vinda da API Vendus (total da sessão).
- **Canais Externos (AirMenu)** — pedidos de delivery de plataformas externas
  (Glovo, Uber Eats, Bolt Food) faturados no AirMenu. O `airMenuCalculated` é o
  subtotal declarado pelo funcionário; `airMenuUber/Glovo/Bolt` são as referências
  automáticas por plataforma; `airMenuTotal` é a sua soma.
- **Diferença Vendus** — `vendusCalculated − vendusTotal`. Deve ser zero ou
  explicado. Uma diferença positiva pode indicar vendas não registadas no Vendus;
  negativa pode indicar um erro de registo.
- **Diferença AirMenu** — `airMenuCalculated − airMenuTotal`. Deve ser zero ou
  explicado. Visível ao funcionário no step de revisão (pré-submissão) e ao
  manager no backoffice. Por plataforma: `uber/glovo/bolt − airMenuUber/Glovo/Bolt`.
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
  `review()` que devolve nova instância. Guarda `locationId` (a loja a que o
  fecho pertence — spec B2 D3/D4; ver "Isolamento por organização" abaixo) e
  os montantes declarados por canal
  (TPA, Uber, Glovo, Bolt, Eatz, dinheiro), os totais de referência AirMenu
  (`airMenuUber/Glovo/Bolt`), movimento de caixa (entradas/saídas, gaveta
  início/fim), a contagem física de denominações (`drawerDenominations`)
  e os campos derivados `totalCalculated`, `vendusCalculated`, `airMenuCalculated`
  e `sangriaAmount`. `vendusCalculated` e `airMenuCalculated` são calculados no
  construtor a partir dos campos brutos — não persistidos na BD.
- **CashClosingStatus** — `"pending" | "approved" | "rejected"`.
- **CashClosingCalculator** — serviço de domínio puro com quatro métodos estáticos:
  `computeTotal()` (soma de todos os canais), `computeVendusSubtotal()` (TPA + Eatz + dinheiro),
  `computeAirMenuSubtotal()` (Uber + Glovo + Bolt) e `computeSangria()` (excesso de
  gaveta acima de 100 €, arredondado a 2 casas).
- **DrawerDenominations** — contagem física das notas e moedas na gaveta no fim
  do turno. Campos: `notes50/20/10/5`, `coins200/100/50/20/10/1`. Imutável após
  submissão — o manager não a pode alterar, pois é auditoria.
- **RegisterSession** — value object que representa uma sessão de caixa Vendus
  (abertura → fecho). Campos: `openedAt`, `closedAt` (null se ainda aberta),
  `total` (vendas da sessão já descontadas de notas de crédito NC).
- **Invariante de duplicado**: cada sessão Vendus só pode ter um fecho
  (identificado por `sessionOpenedAt`). Permite dois fechos no mesmo dia se
  forem sessões distintas (ex: turno manhã + turno tarde).

## Isolamento por organização (spec B2)

Este é o módulo que a spec B2 converteu em segundo lugar, de propósito
(`.scratch/scoped-access/spec.md`, D3/D4/D6/D14, ADR-0009): é o único módulo
que junta uma tabela com localização, uma rota de escrita pública sem
autenticação e um chamador sem qualquer payload de auth. As decisões de
estilo do módulo piloto (`bank-accounts`, ver o seu README) aplicam-se aqui
também — `organizationId` como primeiro parâmetro separado em todo output
port, como campo dentro do comando/query em todo input port, adapters a
receber `ScopedQueryFactory` em vez de `SupabaseClient`. O que este módulo
acrescenta:

- **As rotas públicas resolvem o scope via `requireDeviceAuth`, não do request (D14).**
  `verify-pin`, `submit`, `sessions` e `airmenu-totals` não têm utilizador
  autenticado — o kiosk e o ecrã de fecho são páginas públicas na mesma
  aplicação, sem build separado. O `publicRouter` monta `requireDeviceAuth`
  (`src/middleware/device-auth.ts`, spec de location-credentials, ticket 01)
  como middleware de router, e o controller lê `organizationId`/`locationId`
  de `req.deviceAuth!`, nunca do body. Um ecrã emparelhado resolve para a sua
  loja real via `X-Device-Token`; um ecrã não emparelhado continua a cair no
  fallback de `UNATTENDED_SCOPE` que `requireDeviceAuth` já traz embutido —
  o comportamento anterior a este ticket, preservado por esse fallback. As
  rotas geridas (`list`, `get`, `patch`) continuam a ler `req.auth!.orgId`
  como qualquer módulo autenticado.
- **`locationId` é um campo de comando, não um escopo (D7).** Ao contrário de
  `organizationId`, não ganhou um tipo próprio nem viaja como parâmetro
  separado nos output ports — é uma propriedade normal da entidade
  `CashClosing` e do `CashClosingDto`, escrita explicitamente por
  `SupabaseCashClosingRepository.save()` a partir de `closing.locationId`.
  Nunca é o default da coluna, e nunca é actualizado por `update()` — é
  imutável após submissão, tal como `drawerDenominations`.
- **O lookup de PIN passou a ser escopado à organização (`EmployeeRepositoryPort.findActiveByPinHash`).**
  Antes procurava em todos os funcionários da base de dados; correcto por
  construção enquanto existe uma organização. Continua correcto por
  construção depois de escopado — o risco de colisão de PIN de 4 dígitos
  *entre* organizações é o item diferido de spec A, não é resolvido aqui.
- **O par legado morto foi convertido, não apagado (D9).** `src/routes/cashClosingRoutes.ts`
  (não montado em `server.ts`) e `src/services/cashClosingService.ts` (só
  importado por essa rota) replicam exactamente as mesmas regras — rotas
  públicas a partir do `UNATTENDED_SCOPE`, rotas geridas a partir de
  `req.auth!.orgId` — e passaram de `getSupabaseServiceRole()` directo para
  `createScopedQuery(organizationId)`. Ficam scoped porque manter uma
  excepção "código morto não precisa" é o primeiro item de uma allowlist que
  cresce; nada monta estas rotas hoje.

## Ports

### Entrada (use cases)

- `VerifyPinPort` — verifica o PIN de 4 dígitos do funcionário dentro da
  organização; devolve `{ employeeId, fullName }` ou lança `InvalidPinError`.
  `VerifyPinCommand = { organizationId, pin }` — `organizationId` vem de
  `req.deviceAuth!.organizationId` (rota pública, D14).
- `SubmitClosingPort` — funcionário submete o fecho com `sessionOpenedAt`; usa
  o total da sessão Vendus e impede duplicado por sessão. `vendusTotal` é
  best-effort: fica `null` se a API Vendus estiver indisponível.
  `SubmitClosingCommand` inclui `organizationId` e `locationId`, ambos vindos
  de `req.deviceAuth!` (D14) — nunca do cliente, mesmo que o body os inclua.
  Em vez de `employeeId`, o comando leva `pin`: o use case volta a verificar
  o PIN através do `VerifyPinPort` (nunca confia num `employeeId` que o
  cliente diga ter, sem prova) e usa o `{ employeeId, fullName }` devolvido.
  Um `PIN` inválido lança `InvalidPinError`; um `locationId` sobre o limite
  de submissões lança `RateLimitExceededError` (ver `SubmitRateLimiterPort`).
- `GetAvailableSessionsPort` — lista sessões Vendus para uma data, anotando quais
  já têm fecho submetido no nosso sistema. Usado pelo kiosk antes de submeter.
  `GetAvailableSessionsQuery = { organizationId, date }`, `organizationId` de
  `req.deviceAuth!.organizationId`.
- `ListClosingsPort` — lista fechos com filtros opcionais: `from`/`to` (intervalo
  de datas), `date` (atalho para `from=to=date`), `status`, `employeeId`,
  paginação `limit`/`offset`. `ListClosingsQuery` inclui `organizationId`,
  vindo de `req.auth!.orgId` (rota gerida).
- `GetClosingPort` — detalhe de um fecho por ID; lança `ClosingNotFoundError`.
  `GetClosingQuery = { organizationId, id }`, `organizationId` de `req.auth!.orgId`.
- `ReviewClosingPort` — manager aprova/rejeita e/ou edita valores; recalcula
  `totalCalculated`, `vendusCalculated`, `airMenuCalculated` e `sangriaAmount`
  se campos numéricos mudarem; define `reviewedAt` se `status` mudar. Nunca
  altera `drawerDenominations`, `airMenuUber/Glovo/Bolt` nem `locationId`
  (imutáveis após submissão). `ReviewClosingCommand` inclui `organizationId`,
  de `req.auth!.orgId`.
- `GetAirMenuTotalsPort` — consulta os totais AirMenu para uma data sem submeter
  fecho. Usado pelo kiosk no step de revisão (pré-submissão). Devolve `null` se
  o gateway não estiver configurado ou falhar (best-effort). Não toca a base
  de dados (só a API AirMenu via `AirMenuDeliveryGatewayPort`), por isso não
  ganhou `organizationId`.

### Saída (dependências do domínio)

- `CashClosingRepositoryPort` — `save(organizationId, closing)`,
  `findById(organizationId, id)`, `list(organizationId, filter)`,
  `update(organizationId, closing)`,
  `existsForEmployeeOnDate(organizationId, employeeId, closingDate)`,
  `existsForSession(organizationId, sessionOpenedAt)`. `organizationId` é
  sempre o primeiro parâmetro (D2).
- `EmployeeRepositoryPort` — `findActiveByPinHash(organizationId, pinHash)`,
  `findActiveById(organizationId, id)`.
- `SubmitRateLimiterPort` — `checkAndRecord(locationId): boolean`. Rate limit
  de `submit` por loja (não por organização): devolve `true` e regista a
  tentativa se ainda dentro do limite, `false` se excedido.
- `VendusRegisterSessionsGatewayPort` — `getSessionsForDate(date)`, `getSessionTotal(date, openedAt)`.
  Chama a API Vendus, não a base de dados — sem `organizationId`.
- `AirMenuDeliveryGatewayPort` — `getDeliveryTotalsForDate(date)` → `{ uber, glovo, bolt }`.
  Opcional: se não configurado, os campos AirMenu ficam null. Chama o módulo
  air-menu via port, não a base de dados — sem `organizationId`.

## Adapters

### Entrada

- `CashClosingController` — expõe dois `Router` Express:
  - `publicRouter` → rotas sem auth, com `requireDeviceAuth` montado ao nível
    do router (D14: `organizationId`/`locationId` vêm de `req.deviceAuth!`,
    nunca do request body):
    - `POST /cash-closings/verify-pin`
    - `POST /cash-closings/submit` — aceita `sessionOpenedAt?` e `drawerDenominations?`
    - `GET /cash-closings/sessions?date=` — lista sessões Vendus com flag `alreadySubmitted`
    - `GET /cash-closings/airmenu-totals?date=` — totais AirMenu pré-submissão (best-effort; `null` se indisponível)
  - `managedRouter` → rotas com `requireAuth + requireMinRole("manager")`:
    `GET /cash-closings`, `GET /cash-closings/:id`, `PATCH /cash-closings/:id`.
    `organizationId` vem de `req.auth!.orgId`.

### Saída

- `SupabaseCashClosingRepository` — implementa `CashClosingRepositoryPort`
  via `ScopedQueryFactory` (D2) — não guarda um `SupabaseClient`. Faz join com
  `hr_employees` para popular `employeeName`. Persiste `drawer_denominations`
  como JSONB e `air_menu_uber/glovo/bolt` como numeric nullable; `save()`
  escreve `location_id` explicitamente a partir de `closing.locationId`
  (D3/D4, nunca o default da coluna); nenhum destes campos (nem `location_id`)
  é atualizado no `update()` (imutáveis após submissão).
- `AirMenuDeliveryGateway` — implementa `AirMenuDeliveryGatewayPort`. Recebe
  `GetSummaryPort` (do módulo air-menu) e `enterpriseId` (env `AIRMENU_CLOSING_ENTERPRISE_ID`).
  Chama `getSummary` com `startOfDay/endOfDay` para a data do fecho e lê
  `analytics.byPlatform` para extrair os totais por plataforma (NCs já descontadas).
- `SupabaseEmployeeRepository` — implementa `EmployeeRepositoryPort` via
  `ScopedQueryFactory`.
- `InMemorySubmitRateLimiter` — implementa `SubmitRateLimiterPort`. Mapa
  `locationId → {count, resetAt}` em memória, janela fixa (mesmo estilo do
  `scanRateMap` do kiosk). Ver "Decisões de design" para os números e o
  porquê de não precisar de limpeza periódica.
- `VendusRegisterSessionsGateway` — implementa `VendusRegisterSessionsGatewayPort`;
  chama `GET /registers/{id}/movements/` em paralelo com `GET /documents/` (FS+FT+NC)
  para calcular totais correctos por sessão. Instanciado com `registerId`
  (env `VENDUS_REGISTER_ID`).
- `session-builder.ts` — módulo puro (sem I/O) que implementa `buildSessions`:
  constrói sessões a partir dos movimentos e desconta NCs. Separado do gateway
  para ser testável sem dependências de infra.

## Decisões de design (ADR resumido)

**`SubmitClosingUseCase` já não depende de `EmployeeRepositoryPort`.**
Reutiliza `VerifyPinPort` em vez de duplicar o lookup do funcionário: há
exactamente um lugar no código que decide se um PIN é válido, e o `submit`
usa esse mesmo veredicto ao invés de confiar num `employeeId` que o cliente
diga ter (sem qualquer prova associada, dado que a rota é pública). Isto
também fecha uma lacuna: um PIN incorrecto em `submit` deixou de ser
aceite silenciosamente — passa a lançar `InvalidPinError`, tal como já
acontecia em `verify-pin`.

**Rate limit de `submit`: 10 tentativas / 5 minutos, por `locationId`, sem limpeza periódica.**
Submissões legítimas são ~1 por loja por turno, por isso o limite é generoso
para reenvios (ex: erro de rede) e ainda assim limita tentativas de
adivinhar o PIN através deste endpoint. Ao contrário do `scanRateMap` do
kiosk (chave = IP, potencialmente controlado por um atacante e por isso
limpo periodicamente), aqui a chave é `locationId`, cuja cardinalidade está
limitada às lojas realmente emparelhadas na organização — o mapa não pode
crescer sem limite, logo não precisa de `setInterval` de limpeza.

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
`vendusCalculated` (TPA + Eatz + cashSales) é o subtotal declarado para o canal próprio;
compara com `vendusTotal` (referência API Vendus) para produzir a diferença Vendus.
`airMenuCalculated` (Uber + Glovo + Bolt) é o subtotal declarado para canais externos;
compara com `airMenuTotal` = `airMenuUber + airMenuGlovo + airMenuBolt` (referência API
AirMenu) para produzir a diferença AirMenu. `totalCalculated` = `vendusCalculated +
airMenuCalculated` — soma de todos os campos declarados pelo funcionário.
`vendusCalculated` e `airMenuCalculated` são campos derivados calculados no construtor
da entidade; `airMenuTotal` é calculado no `toDto()` do use case e não é persistido.

**`locationId` é imutável após submissão e vem sempre de `req.deviceAuth!`, nunca do cliente.**
O kiosk é uma página pública (spec B2 D14): não há como validar no body uma
loja que o cliente alegasse. `req.deviceAuth!.locationId` resolve à loja
real de um ecrã emparelhado (`X-Device-Token`) ou, para um ecrã não
emparelhado, ao fallback `UNATTENDED_SCOPE` (ticket 01 de
location-credentials) — nunca a um valor vindo do body. O `review()`
preserva `this.locationId` e o repositório não o inclui no `update()`, tal
como `drawerDenominations`.

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

**Sessões cross-day: NCs da sessão anterior não debitam a sessão actual.**
Quando uma sessão de caixa abre num dia e fecha no dia seguinte, o movimento
`open` não aparece nos dados do dia do fecho. O `buildSessions` não consegue
associar os `out` movements (NCs) dessa sessão a nenhum `cur` activo, e o
fallback das "unhandled NCs" debitava-as incorrectamente na sessão seguinte.
Fix: um pré-passo regista todas as NCs referenciadas por qualquer `out` movement
no dia (independentemente de haver sessão activa). Essas NCs são excluídas do
fallback — pertencem à sessão anterior, não à actual.

**O Vendus devolve `doc_id+1` ou `doc_id+2` nos `out` movements de NC.**
O lookup de NC em `resolveNcId` tenta `document_id`, `document_id − 1` e
`document_id − 2` (casos reais observados com ambos os offsets no mesmo dia).
Usar só `−1` deixava duas NCs sem resolver quando o offset era `+2`.

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
  (restaurante) é aceitável. Sessões cross-day que abrem num dia e fecham no
  seguinte são tratadas correctamente no que toca às NCs (o fix de 2026-08-14
  exclui-as do fallback), mas as suas vendas (`in` movements) ficam invisíveis
  para o dia do fecho — o total da sessão seguinte não inclui essas vendas.
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
