# Module: hr

> Status: active
> Last updated: 2026-09-27

---

## What it is and what it's for (business perspective)

Módulo **Pessoas & Documentos** (RH-02) + **Visão Geral operacional** (RH-01)
+ **Escalas & Turnos** (RH-03). Trata o cadastro de colaboradores e o dossiê
documental de cada um como a fonte operacional de RH — substitui a antiga
entrada "Funcionários" por uma vista com sinais de completude de perfil,
onboarding e situação documental, mais um perfil 360º por colaborador —
agrega, só em leitura, KPIs de equipa/operação do dia/pendências a partir de
dados reais já existentes (turnos, presença, férias, pagamentos) — e, desde
a RH-03, também **cria/edita/publica turnos planeados**, gere uma **escala
base semanal** por colaborador e **rotações automáticas** entre 2
colaboradores da mesma função (ver secção RH-03 abaixo).

**O problema que resolve:**
A área antiga concentrava cadastro, turnos, pagamentos, férias e documentos
no mesmo ecrã, sem indicar quem tinha o perfil incompleto ou documentos a
expirar, e a gestão de documentos era um simples upload/download/apagar sem
histórico — substituir um ficheiro apagava a versão anterior, destruindo
evidência.

**Conceitos-chave para o negócio:**

- **Colaborador** — pessoa cadastrada em RH, com dados pessoais, contratuais
  e documentos. Continua a ter turnos/pagamentos/férias, mas esses ficam nos
  seus próprios ecrãs (não duplicados aqui).
- **Documento (versão)** — cada envio de um ficheiro para uma categoria
  (contrato, cartão de cidadão, NIF, IBAN, …) cria uma **versão**. Substituir
  cria uma versão nova sem apagar a anterior; remover marca a versão como
  removida sem apagar o ficheiro nem a linha.
- **Categoria obrigatória** — algumas categorias de documento são exigidas
  pela organização; a falta delas aparece como pendência prioritária.

---

## Technical purpose

Expõe uma API REST nova (`/api/hr/people*`) para listar/gerir colaboradores
e o respetivo dossiê documental com versionamento, foto de perfil e um
histórico de auditoria com actor real, `/api/hr/overview*` (RH-01) que
agrega, **só leitura**, KPIs/alertas/snapshot a partir dos dados reais de
turnos/presença/férias/pagamentos — nunca recalcula nem altera esses dados,
só lê e resume — e `/api/hr/schedules*` (RH-03) que **escreve** turnos
planeados (`hr_work_shifts`, as mesmas linhas que o legacy já lia/escrevia,
agora também geridas por este módulo), escala base semanal e rotações. **Não
é responsabilidade deste módulo**: registar presença real/ponto (isso
continua `PATCH /api/hr/shifts/:id/attendance`, legacy), férias, pagamentos,
kiosk — esses continuam 100% geridos pelo código legacy
(`src/routes/hrRoutes.ts` e afins).

## Estratégia de coexistência com o legacy

Este módulo é **aditivo**, não uma substituição imediata:

- As rotas legacy (`/api/hr/employees...`, incluindo documentos) continuam a
  existir e a funcionar sem alterações — usadas por outras páginas legacy
  (turnos, pagamentos, férias, kiosk) fora do âmbito desta task.
- Este módulo expõe uma superfície distinta, `/api/hr/people*`, que o
  frontend novo (Fase 2) consome em exclusivo.
- Ambos leem/escrevem as mesmas tabelas (`hr_employees`,
  `hr_employee_documents`), estendidas por uma migração só aditiva — nunca
  remove nem renomeia colunas. Os dados ficam sempre consistentes entre a
  área nova e a legacy durante a transição.
- Uma limpeza futura (remover as rotas/serviços legacy de
  colaboradores+documentos depois do frontend migrar totalmente) é trabalho
  de uma task posterior, não desta.
- **RH-03**: `hr_work_shifts` passa a ter **dois caminhos de escrita**
  simultâneos — o legacy (`POST/PATCH/DELETE /api/hr/shifts`,
  `hrShiftService.ts`) e o novo (`/api/hr/schedules/work-shifts*`,
  `SupabaseWorkShiftRepository`). Investigação prévia confirmou que **nenhum
  ecrã do frontend chama hoje as rotas legacy de escrita** (só
  `fetchShifts`/`attendance` são usadas por `HrCalendarPage.tsx`) — o risco
  de escrita concorrente é teórico, não real, mas fica registado: se algum
  script/integração externa ainda os chamar, os novos campos aditivos
  (`status`, `source`, `break_minutes`, `rotation_id`) ficam nos valores por
  omissão (`published`, `manual`, `0`, `null`) em qualquer linha criada pelo
  caminho legacy.

## Domain concepts

- **`Employee`** — entidade com dados pessoais/contratuais. `create()` exige
  `fullName`; `update()` só altera os campos explicitamente enviados;
  `activate()`/`deactivate()` (soft delete, define `endedAt`);
  `updatePhoto()`. Não inclui `weeklySchedule`/`hasKioskPin` (turnos/kiosk) —
  esses continuam só no domínio legacy.
- **`EmployeeDocument`** — uma versão de documento. `createFirstVersion()`
  (versão 1); `supersede()` cria a próxima versão a partir da atual
  (`DocumentNotCurrentError` se a origem já não for a atual);
  `markSuperseded()` marca a antiga `isCurrent=false`; `remove()` é remoção
  lógica (`status="removed"`). **Nenhum destes métodos apaga a linha nem o
  ficheiro** — é o invariante central deste domínio (RH-02: "substituir ou
  remover não pode apagar a evidência anterior").
- **`document-status.service`** — deriva o estado de exibição de um
  documento (`ok`/`expiring`/`expired`/`pending_validation`/`rejected`/
  `removed`) e resume os **requisitos documentais obrigatórios** vs. os
  documentos existentes (`computeMandatoryDocumentsSummary`). Um requisito
  (`MandatoryDocumentRequirement`) é satisfeito por **qualquer uma** das
  suas categorias. Desde a introdução das **categorias de documento
  configuráveis** (`hr_document_categories`, entidade
  `DocumentCategoryDefinition`), a lista de requisitos obrigatórios já não é
  toda fixa:
  - **"Documento de identificação"** (Cartão de Cidadão OU Título de
    Residência OU Passaporte) continua o único requisito fixo
    (`DEFAULT_MANDATORY_REQUIREMENTS`) — decisão confirmada com o
    utilizador, fica fora da tela de gestão.
  - Todas as outras categorias (Contrato de trabalho, Comprovativo de IBAN,
    Apólice de seguro AT, Certificado de morada, Ficha de colaborador,
    Formação de segurança, Atestado de saúde, NIF, + qualquer categoria
    nova criada pelo utilizador) vivem em `hr_document_categories`, uma por
    organização, cada uma com `label`, `mandatory`, `jobRoles` (`[]` =
    todos os cargos, ou uma lista de cargos específicos) e
    `acceptedMimeTypes`. `applicableCategoriesFor(defs, jobRole)` filtra as
    ativas e aplicáveis ao cargo do colaborador; `buildDynamicRequirements`
    converte as `mandatory=true` num requisito de categoria única cada.
  - **Pendências prioritárias e alertas do Overview só listam categorias
    obrigatórias** (pedido explícito do utilizador) — `missingRequirements`
    continua a ser a única fonte dessas pendências. Categorias opcionais em
    falta só aparecem em `missingOptional`, dentro do perfil do próprio
    colaborador (`computeMissingOptional`) — nunca nas pendências
    prioritárias nem nos alertas do Overview.
  - Gestão pela UI: botão "Categorias de documentos" em Pessoas &
    Documentos → `hr-document-categories.controller.ts` (CRUD) — desativar
    uma categoria (nunca apagar) para de a exigir/sugerir sem tocar nos
    documentos já enviados nela.
  `EXPIRING_SOON_DAYS = 30` continua uma constante fixa.
- **`profile-completeness.service`** — completude do perfil (%) e por secção
  (dados pessoais/morada/contrato/conta bancária/contacto de emergência), a
  partir de um conjunto fixo de campos considerados "obrigatórios para
  completar o perfil" — também não configurável por organização nesta fase.
- **`sensitive-field-masking.service`** — mascara IBAN/NIF/NISS/nº de
  documento de identificação (só os últimos 4 caracteres visíveis) quando o
  pedido vem de um `hr_viewer`; `manager`/`admin` veem o valor completo.
- **`overview-shift-state.service`** (RH-01) — deriva, para UM turno, o
  **estado atual** (`AGENDADO|EM_TOLERANCIA|PRESENTE|
  ATRASADO_AGUARDANDO_ENTRADA|FINALIZADO|AUSENTE_OPERACIONAL`) e as
  **ocorrências do dia** (`CHEGADA_ATRASADA|SAIDA_ANTECIPADA|SEM_SAIDA|
  SEM_ENTRADA`), que nunca são "corrigidas" silenciosamente — podem
  coexistir com qualquer estado. `shiftNeedsReview()` decide se entra na
  fila "Turnos por conferir"; `assignReviewPriority()` decide a prioridade
  dessa fila; `hasOverlappingOpenAttendance()` deteta `CONFLITO` (duas
  presenças abertas em simultâneo do mesmo colaborador).
  `LATE_TOLERANCE_MINUTES = 10` é uma constante do módulo (mesmo valor do
  mockup RH-01), não configurável por organização. Desde a task **"Melhorar
  Hoje na operação"**:
  - `shiftWindow()` (privada) passou a calcular o fim real do turno a
    partir do **último período** (`secondEndTime` quando existe) e a somar
    1 dia quando `endsNextDay` — antes disto, um turno repartido era
    considerado "ausente" já durante o intervalo previsto (usava só o fim
    do 1º período), e um turno noturno tinha `end < start` no mesmo dia
    civil. Corrige `computeShiftState`/`computeShiftExceptions`/
    `shiftNeedsReview`/`assignReviewPriority` de uma vez, sem duplicar a
    noção de "fim do turno" — nenhum destes precisou de mudar a própria
    assinatura.
  - **`computeOperationDisplayState()`** — estado de **exibição** para
    "Hoje na operação" (`AGENDADO|EM_TOLERANCIA|PRESENTE|ATRASADO|
    FINALIZADO|AUSENTE|INTERVALO`): renomeia `ATRASADO_AGUARDANDO_ENTRADA`→
    `ATRASADO` e `AUSENTE_OPERACIONAL`→`AUSENTE` (só para este painel — o
    `ShiftState` interno usado por "Turnos por conferir"/alertas não muda,
    para não haver duas fontes de verdade nem quebrar o resto do módulo),
    e sobrepõe `INTERVALO` quando o turno é repartido e `now` cai no
    intervalo entre o 1º e o 2º período (a entrada/saída de um turno
    repartido não é rastreada por período, só uma vez para o turno todo —
    por isso nunca se mostra `ATRASADO`/`AUSENTE` durante um intervalo
    previsto, mesmo sem nova marcação de entrada).
  - **`describeSituation()`**/**`describeShiftSchedule()`** — texto
    contextual ("Situação") e horário formatado ("Turno hoje", 1 ou 2
    partes) — nunca repetem o que `state` já diz.
  - **`describeExceptionLabel()`** — extraída de dentro de
    `ListShiftsToReviewUseCase` para ser partilhada também por
    `GetShiftToReviewUseCase` (mesma regra, nunca duplicada).
- **`overview-kpi.service`** — agrega turnos de um dia em contagens de
  **pessoas únicas** (nunca turnos) para Escalados/Presentes/Atrasos/
  Ausentes — 2 turnos da mesma pessoa contam 1.
- **`overview-alert.service`** — `prioritizeAndDedupAlerts()` centraliza a
  matriz de prioridade (`CRITICA > ALTA > MEDIA > BAIXA`, depois
  antiguidade/data, depois id) — nunca no frontend.
- **`WorkShift`** (RH-03) — um turno **planeado** (nunca presença real, isso
  é `hr_shift_attendance`/`ShiftAttendanceReadPort`). `status: draft |
  published` — só o manager vê rascunhos, "Turnos por publicar" no painel de
  alertas conta-os. `source: manual | base_schedule | rotation` regista a
  proveniência **e** duplica como flag de proteção: qualquer edição
  interativa (`applyManualEdit`) força `source="manual"`, o que passa a
  proteger esse turno de reaplicações futuras de escala base/rotação (nunca
  sobrescritas sem confirmação — pedido explícito da task). `overwriteFromTemplate`
  é o único caminho que uma reaplicação de escala base/rotação usa para
  atualizar um turno já existente (nunca `applyManualEdit`).
  Desde a task **"Novo Turno Padrão Semanal"**, um turno pode ser:
  - **Repartido** (`kind: "direct" | "split"`) — 2º período opcional
    (`secondStartTime`/`secondEndTime`, nunca sobreposto ao 1º); `segments`
    devolve 1 ou 2 `WorkShiftSegment`, `durationMinutes()` soma-os.
  - **Noturno** (`endsNextDay: true`) — atravessa a meia-noite (ex:
    22:00→06:00); `endTime` passa a referir-se ao dia seguinte a `workDate`.
    **Nunca combinado com repartido nesta V1** (`assertShape` rejeita as
    duas coisas ao mesmo tempo) — dívida documentada, ver Known gaps.
  - **Membro de série** (`seriesId`) — tag partilhada por todos os turnos
    criados numa mesma aplicação de padrão semanal recorrente (ver
    `shift-recurrence.service`/`shift-series-shared` abaixo). `null` =
    turno avulso, **ou já destacado de uma série** por edição individual.
  `applyManualEdit` continua a marcar sempre `source="manual"` e agora
  **também limpa `seriesId`** — uma exceção individual fica imune tanto a
  reaplicação de escala base/rotação como a uma futura edição em lote
  "este e os seguintes"/"toda a série". `applySeriesEdit` é o contraponto
  usado só por edições em lote de série: preserva `seriesId` e não altera
  `source` (o turno continua "a seguir o padrão").
- **`BaseScheduleTemplate`** (RH-03) — uma célula (colaborador, dia da
  semana 0=Segunda..6=Domingo) do "modelo semanal" de um colaborador —
  no máximo uma por combinação (`hr_base_schedule_templates`, unique
  `(org_id, employee_id, weekday)`). `isDayOff=true` = "Folga" (sem
  horário/loja). "Aplicar esta escala à semana"
  (`apply-base-schedule.use-case.ts`) lê as 7 células e materializa/atualiza
  `hr_work_shifts` para as datas da semana alvo — nunca em dias de Folga,
  feriado, ou com o colaborador em férias/ausência (sempre saltados); nunca
  sobre um turno `source !== "base_schedule"` (uma exceção manual ou de
  rotação) **sem** `overrideExceptions: true` explícito.
- **`ShiftRotation`** (RH-03) — configuração de rotação semanal entre
  **exactamente 2** colaboradores da mesma função (MVP da task), alternando
  Turno A/Turno B a cada semana a partir de `anchorDate` (sempre uma
  segunda-feira). `participantOnPatternA(rotation, weekStartDate)` e
  `participantOnPatternB(...)` são funções puras que decidem quem fica em
  cada padrão numa semana qualquer, a partir de `weeksBetweenMondays`
  (semana par desde a âncora → participante[0] no padrão A). "Aplicar"
  (`apply-shift-rotation.use-case.ts`) materializa turnos reais para os 2
  participantes, todos os 7 dias de cada semana, para N semanas (omissão:
  8) — salta férias/ausência/feriado por participante, e salta (sem opção
  de sobrepor) qualquer dia já ocupado por um turno que não seja
  `source="rotation"` **desta mesma rotação** (turno manual, de escala
  base, ou de outra rotação — todos tratados como exceção protegida).
  "Pausar"/"desativar" são o mesmo estado binário `active` nesta fase —
  simplificação confirmada, ver Known gaps. Desde a task **"Melhorar Turnos
  Rotativos"**, o Padrão A e o Padrão B podem ser **turnos repartidos**
  (`ShiftPattern.secondStartTime/secondEndTime`, mesma regra de "não
  sobrepor o 1º período" já usada em `WorkShift`) — `apply-shift-rotation`
  e `overwriteFromTemplate` (agora com `endsNextDay`/`secondStartTime`/
  `secondEndTime` opcionais) propagam o 2º período tal como o 1º.
  `RotationWeekPreviewDTO` passou a incluir `patternA`/`patternB` (o
  horário real, não só o nome de quem o faz) — pedido explícito do
  utilizador para "melhorar a pré-visualização". Escala base **não**
  ganhou turno repartido nesta ronda (só rotações — âmbito confirmado com
  o utilizador); `overwriteFromTemplate` continua a defaultar
  `endsNextDay=false`/`secondStartTime=null` quando quem chama não os
  passa, por isso a escala base não precisou de nenhuma alteração.
- **`schedule-alerts.service`** — 3 funções puras para o painel "Alertas e
  ações": `detectOverlaps` (2 turnos do mesmo colaborador/dia com horários
  que se intersectam), `detectMissingCoverage` ("falta de cobertura" — só
  calculável **em relação à escala base**: um dia em que a escala base
  prevê trabalho mas não há turno nem ausência nem feriado a justificar a
  falta; sem escala base configurada para um colaborador, nunca gera alerta
  para ele), `countPendingPublish` (turnos em rascunho no período).
- **`shift-recurrence.service`** ("Novo Turno Padrão Semanal") — motor puro
  de expansão/deteção de sobreposição, sem infra:
  - `expandRecurrence(spec)` — varre dia a dia a partir de `startDate` (não
    ancora a segunda-feira nem assume mês de 4 semanas — "semana 5" e
    mudança de mês funcionam sem lógica especial), casando cada data com a
    `WeeklyDayRule` do seu dia da semana (`repeat: none|weeks|until_date`).
  - `occurrenceOverlapsShift(occurrence, shift)` — deteta sobreposição
    comparando intervalos em minutos absolutos ancorados ao dia da
    ocorrência, cobrindo turnos repartidos (2 intervalos) e noturnos
    (soma 1440 min ao fim quando `endsNextDay`); compara só dias
    adjacentes (`|dayOffset| <= 1`, nenhum turno passa de ~24h). **Também
    usado por `CreateWorkShiftUseCase`/`UpdateWorkShiftUseCase`** (turno
    único) — substituiu a comparação ingénua "mesmo dia" que só olhava para
    o próprio dia, que já não chegava com turnos noturnos.
  - `partitionOccurrences(...)` — separa ocorrências planeadas em
    `toCreate`/`conflicts` (sobrepõe turno existente do colaborador,
    bloqueia por omissão)/`skipped` (férias/ausência/feriado — **nunca**
    criado, nem com `force`).
- **`shift-series-shared.computeSeriesPartition(...)`** — único ponto de
  cálculo partilhado por `PreviewWorkShiftSeriesUseCase` e
  `CreateWorkShiftSeriesUseCase`, para o preview usar **exatamente** as
  mesmas regras da criação (requisito explícito da task): valida as regras
  (`validateRules` — pelo menos 1 regra, 1-2 segmentos por regra, cada dia
  da semana reclamado por no máximo 1 regra) e o intervalo de semanas
  (1-52), chama `expandRecurrence`, e cruza o resultado com turnos
  existentes + `LeaveReadPort.findActiveInRange` + `HolidayReadPort` do
  período (com padding de ±1 dia para apanhar turnos noturnos a
  transbordar a fronteira do intervalo).
- **`repeat-calendar-week-shared.computeRepeatWeekPartitions(...)`**
  ("Repetir escala pelo calendário") — **reaproveita** `computeSeriesPartition`
  sem duplicar nada: em vez de um padrão vindo de um formulário, lê os
  turnos REAIS de uma semana já montada no calendário
  (`filterSourceWeekShifts`, filtrada aos dias/colaboradores escolhidos),
  agrupa-os por **(colaborador, local)** — `groupShiftsByEmployeeAndLocation` —
  e por grupo constrói `WeeklyDayRule[]` a partir do horário real de cada
  dia (`buildRulesFromShifts`, 1 regra por combinação exata de horário —
  vários dias com o mesmo horário viram 1 só regra), depois chama
  `computeSeriesPartition` uma vez por grupo. `repeatWeekTargetStartDate`
  é sempre a segunda-feira imediatamente a seguir à semana de origem
  (exemplo da task: origem 28/09–04/10 → destino a partir de 05/10).
  Usado por `PreviewRepeatCalendarWeekUseCase` e `RepeatCalendarWeekUseCase`
  — o preview usa a função **idêntica** à criação (mesmo requisito já
  cumprido por "Novo Turno Padrão Semanal"). Um colaborador com turnos em
  2 lojas diferentes na semana de origem gera 2 grupos (2 séries, uma por
  loja) — nunca mistura locais na mesma série.

## Ports

### Input (use cases)

- `ListEmployeesPort` / `GetPeopleKpisPort` / `GetEmployeeProfilePort` —
  leitura da lista, dos KPIs+pendências prioritárias, e do perfil 360º.
  `PriorityPendencyEmployeeRef.expiresAt` (novo, opcional — só preenchido
  para `kind: "expiring_document"`) permite ao drawer de pendências da
  Visão Geral mostrar a validade/dias restantes sem uma 2ª chamada — ver
  "Design decisions".
- `CreateEmployeePort` / `UpdateEmployeePort` / `SetEmployeeStatusPort` /
  `UploadEmployeePhotoPort` — escrita de colaborador.
- `GetEmployeeHistoryPort` — histórico agregado de auditoria de um
  colaborador.
- `ListEmployeeDocumentsPort` / `UploadEmployeeDocumentPort` /
  `ReplaceEmployeeDocumentPort` / `RemoveEmployeeDocumentPort` /
  `GetEmployeeDocumentDownloadUrlPort` / `GetEmployeeDocumentHistoryPort` —
  dossiê documental (upload de categoria nova, substituir versão, remoção
  lógica, URL de download, histórico de versões).
- `GetDocumentOverviewPort` (novo, task "Melhorar Visão Geral e reorganizar
  Pessoas") — 1 linha por (colaborador ativo × requisito documental
  aplicável ao seu cargo), cobrindo os 4 estados (`ok`/`expiring`/
  `expired`/`missing`) — não só pendências, ao contrário de
  `GetPeopleKpisPort`. Única fonte de verdade da aba "Pessoas >
  Documentos" do frontend. Reaproveita `computeDocumentRequirementRows`
  (nova função pura em `document-status.service.ts`) — nunca duplica a
  lógica de estado documental já usada pelos KPIs/perfil.
- `GetHrOverviewPort` (RH-01) — KPIs/alertas/snapshot do dia, com blocos
  independentes `team`/`today`/`pending`/`alerts`/`operation`, cada um
  `{status: "ok", data} | {status: "unavailable", reason}` — uma fonte
  falhar nunca derruba as outras nem vira `0` silenciosamente.
  `OverviewOperationRowDTO` ("Hoje na operação", tasks "Melhorar Hoje na
  operação" e "Hoje na operação refinado") separa `state` (curto) de
  `situation` (contextual), inclui `situationWarning` (linha secundária
  persistente — ex: "1º turno sem entrada", continua visível mesmo depois
  de o Estado atual já não a refletir), `shiftToday` (todos os períodos de
  todos os turnos do dia desse colaborador, nunca só o representativo),
  `locationName` (resolvido, nunca UUID) e `reviewShiftId` (drill-down
  direto para a conferência). **Já não há limite de linhas** (a antiga
  `MAX_OPERATION_ROWS=5` escondia o resto da equipa) — devolve todos os
  colaboradores com turno/ausência hoje, ordenados por prioridade
  operacional (lista numerada da task "Hoje na operação refinado", secção
  13); o frontend é que decide mostrar isto num contentor com scroll
  próprio. `OverviewTeamDTO.missingDocumentsCount` (novo, task "Melhorar
  Visão Geral e reorganizar Pessoas") soma requisitos obrigatórios em
  falta por colaborador (nunca colaboradores) — o detalhe por categoria
  vem de `GetPeopleKpisPort.priorityPendencies` (kind="missing_document"),
  reaproveitado pelo drawer da Visão Geral em vez de uma 2ª agregação.
- `ListShiftsToReviewPort` (RH-01) — fila "Turnos por conferir" paginada,
  filtrada por prioridade/local/pesquisa. `ShiftToReviewDTO.locationName`
  (novo) resolve o local — mesmo bug corrigido que no bloco `operation`.
- `GetShiftToReviewPort` (novo, "Melhorar Hoje na operação") — busca 1
  turno "por conferir" pelo `shiftId`, sem paginar a lista inteira —
  permite abrir a conferência (`ShiftReviewModal`, frontend) diretamente a
  partir de "Hoje na operação". Devolve `null` (nunca lança) quando o
  turno não existe ou já não precisa de conferência.
- `ListDocumentCategoriesPort` / `CreateDocumentCategoryPort` /
  `UpdateDocumentCategoryPort` / `SetDocumentCategoryActivePort` —
  CRUD (desativar, nunca apagar) das categorias de documento configuráveis
  por organização.
- `ListWorkShiftsPort` / `CreateWorkShiftPort` / `UpdateWorkShiftPort` /
  `DuplicateWorkShiftPort` / `DeleteWorkShiftPort` / `PublishWorkShiftsPort`
  (RH-03) — CRUD de turnos planeados. `CreateWorkShiftCommand.repeatWeeks`
  cria a mesma repetição semanal em N semanas seguintes (drawer: "Repetir
  semanalmente"); `DeleteWorkShiftPort` recusa (`WorkShiftHasAttendanceError`)
  apagar um turno com presença já registada.
- `GetBaseSchedulePort` / `UpsertBaseScheduleCellPort` /
  `ApplyBaseSchedulePort` (RH-03) — grelha semanal (7 células por
  colaborador) e a sua aplicação a uma semana concreta.
- `ListShiftRotationsPort` / `CreateShiftRotationPort` /
  `PreviewShiftRotationPort` / `ApplyShiftRotationPort` /
  `SetShiftRotationActivePort` (RH-03) — rotações semanais entre 2
  colaboradores da mesma função.
- `GetScheduleAlertsPort` (RH-03) — agrega `schedule-alerts.service` num
  único DTO para o painel "Alertas e ações" do calendário.
- `PreviewWorkShiftSeriesPort` / `CreateWorkShiftSeriesPort` /
  `UpdateWorkShiftSeriesScopePort` / `ClearWorkShiftsPort` ("Novo Turno
  Padrão Semanal") — padrão semanal recorrente: `Preview` e `Create`
  partilham `computeSeriesPartition` (ver acima); `Create` só persiste os
  disponíveis por omissão, também os em conflito com `force: true` (nunca
  os de férias/feriado); um único turno resultante fica com `seriesId:
  null` (não faz sentido "série" para 1 ocorrência). `UpdateWorkShiftSeriesScope`
  recebe `scope: only_this | this_and_following | whole_series` — `only_this`
  destaca (via `applyManualEdit`); os outros dois exigem `seriesId` não nulo
  (`WorkShiftNotInSeriesError` caso contrário) e aplicam `applySeriesEdit` a
  todos/aos com `workDate >= alvo`. `ClearWorkShifts` recebe um
  `ClearShiftsScope` explícito (`day|days|week|weeks|series|week_all`) — nunca
  um "limpar tudo" implícito — e nunca apaga um turno com presença registada
  (salta-o, reporta em `skipped`, continua os restantes). `week_all`
  (novo, "Repetir escala pelo calendário") limpa a semana toda para
  **todos** os colaboradores (opcionalmente filtrado por `locationId`) —
  só disponível quando pedido explicitamente sem colaborador selecionado;
  grava 1 entrada de auditoria por colaborador afetado (nunca uma entrada
  ambígua "do primeiro turno encontrado").
- `PreviewRepeatCalendarWeekPort` / `RepeatCalendarWeekPort` ("Repetir
  escala pelo calendário") — copiam os turnos reais de uma semana para as
  semanas seguintes (ver `computeRepeatWeekPartitions` acima). `Create`
  gera 1 `seriesId` **por (colaborador, local)** (nunca partilhado entre
  colaboradores — cada colaborador continua a poder ser editado/limpo como
  série independentemente dos outros, mesma semântica já usada por
  "Novo Turno Padrão Semanal"); mesma opção `force` (cria também os
  conflitos, nunca férias/ausência/feriado) e o mesmo `publish` global
  para o lote todo. `rotateEmployees` (novo) alterna o horário de cada
  colaborador com o do seguinte em `employeeIds` — ver Design decisions.

### Output (domain dependencies)

- `EmployeeRepositoryPort` / `EmployeeDocumentRepositoryPort` — persistência
  via `ScopedQueryFactory` (D1/D2), sobre `hr_employees`/
  `hr_employee_documents`.
- `HrFileStoragePort` — `store`/`getSignedUrl`/`remove`, com `kind:
  "document" | "photo"` selecionando o bucket (`hr-documents` privado, TTL
  curto; `hr-photos` privado, TTL longo — ver ADR abaixo).
- `HrAuditLogPort` — `record` (fire-and-forget) e `findByEmployeeId`. `actor`
  é **obrigatório** na interface — corrige a lacuna do `hrAuditService`
  legacy, onde o campo existia na tabela mas nunca era preenchido.
- `ShiftAttendanceReadPort` / `LeaveReadPort` / `PaymentReadPort` (RH-01) —
  leitura cross-module (D10) de `hr_work_shifts`/`hr_shift_attendance`,
  `hr_leave_requests`, `hr_employee_payments` — sem nenhum método de
  escrita (a não-mutação da Visão Geral é garantida pela própria forma das
  interfaces, não só por convenção). `ShiftOccurrence` ganhou
  `endsNextDay`/`secondStartTime`/`secondEndTime` ("Melhorar Hoje na
  operação") — antes a Visão Geral lia só `start_time`/`end_time` de
  `hr_work_shifts`, ignorando os campos de turno repartido/noturno já
  introduzidos pela task "Novo Turno Padrão Semanal". `GetHrOverviewUseCase`
  passou a chamar `LeaveReadPort.findActiveInRange` (já existia, usado pela
  RH-03) em vez de `findActiveOnDate`, só para ganhar `endDate` — precisa
  dele para a situação "Até DD/MM" de quem está de férias/baixa/folga.
- `LocationRepositoryPort` (módulo `locations`, cross-module D10/D2 — mesmo
  porto já reutilizado por `location-credentials`) — injetado em
  `GetHrOverviewUseCase`/`ListShiftsToReviewUseCase`/`GetShiftToReviewUseCase`
  só para resolver `locationId → nome`. Antes desta task, **nenhum destes
  3 use cases resolvia o nome do local** — o campo `locationId` chegava cru
  (UUID) até ao frontend, que o mostrava tal e qual (bug confirmado por
  print do utilizador). Se esta fonte falhar, o bloco `operation` continua
  `status: "ok"` só com `locationName: null` em todas as linhas — não é
  informação crítica o suficiente para derrubar o painel inteiro.
- `DocumentCategoryRepositoryPort` — persistência de
  `DocumentCategoryDefinition` em `hr_document_categories` via
  `ScopedQueryFactory`. Injetado também em `ListEmployeesUseCase`/
  `GetPeopleKpisUseCase`/`GetHrOverviewUseCase`/`GetEmployeeProfileUseCase`
  (constroem os requisitos obrigatórios dinâmicos a partir dele).
- `WorkShiftRepositoryPort` (RH-03) — CRUD de `hr_work_shifts` +
  `hasAttendance`/`findAttendanceStatusesByShiftIds` (consulta própria a
  `hr_shift_attendance`, independente de `ShiftAttendanceReadPort` — servem
  propósitos diferentes, ver Design decisions). Ganhou `findBySeriesId`
  ("Novo Turno Padrão Semanal") — consulta por `series_id`, usada pela
  edição/limpeza em lote de uma série.
- `BaseScheduleRepositoryPort` / `ShiftRotationRepositoryPort` (RH-03) —
  persistência de `hr_base_schedule_templates`/`hr_shift_rotations`.
- `HolidayReadPort` (RH-03, novo) — lê `hr_public_holidays` (legacy,
  `src/routes/hrLeaveRoutes.ts`) diretamente, padrão D10. `LeaveReadPort`
  ganhou `findActiveInRange` (além do já existente `findActiveOnDate`) para
  varrer uma semana inteira de uma vez.

## Adapters

### Input

- `HrPeopleController` → expõe os use cases em `/api/hr/people*` (ver tabela
  de rotas no plano/PR). GETs permitidos a `hr_viewer`+; escritas exigem
  `requireMinRole("manager")` inline, mesmo padrão do `hrRoutes.ts` legacy.
- `HrOverviewController` (RH-01) → `GET /api/hr/overview`,
  `GET /api/hr/overview/shifts-to-review` e
  `GET /api/hr/overview/shifts-to-review/:shiftId` (novo, "Melhorar Hoje na
  operação" — devolve 404 quando o turno não precisa de conferência),
  todos só leitura, `hr_viewer`+. A confirmação de conferência **não** tem
  rota aqui — continua a usar o endpoint legacy
  `PATCH /api/hr/shifts/:id/attendance`.
- `HrDocumentCategoriesController` → `GET/POST /api/hr/document-categories`,
  `PATCH /api/hr/document-categories/:id`,
  `PATCH /api/hr/document-categories/:id/active`. GET aberto a `hr_viewer`+;
  escritas exigem `requireMinRole("manager")`.
- `HrSchedulesController` (RH-03) → `/api/hr/schedules/*`. GET aberto a
  `hr_viewer`+; escritas exigem `requireMinRole("manager")` (mesmo padrão do
  resto do módulo — nada aqui usa `admin`, ao contrário de
  `POST/DELETE /leave/holidays` no legacy):
  - `GET /work-shifts`, `POST /work-shifts`, `PATCH /work-shifts/:id`,
    `POST /work-shifts/:id/duplicate`, `DELETE /work-shifts/:id`,
    `POST /work-shifts/publish`.
  - `GET /base-schedule/:employeeId`, `PUT /base-schedule/:employeeId/:weekday`,
    `POST /base-schedule/:employeeId/apply`.
  - `GET /rotations`, `POST /rotations`, `GET /rotations/:id/preview`,
    `POST /rotations/:id/apply`, `PATCH /rotations/:id/active`.
  - `GET /alerts`.
  - **"Novo Turno Padrão Semanal":** `POST /work-shift-series/preview` (sem
    guarda de role — só leitura), `POST /work-shift-series`,
    `PATCH /work-shifts/:id/series-scope`, `POST /work-shifts/clear`.
  - **"Repetir escala pelo calendário":**
    `POST /work-shifts/repeat-week/preview` (sem guarda de role — só
    leitura), `POST /work-shifts/repeat-week`.

### Output

- `SupabaseEmployeeRepository` / `SupabaseEmployeeDocumentRepository` →
  `hr_employees`/`hr_employee_documents` via `createScopedQuery`.
- `SupabaseHrFileStorageAdapter` → delega para `objectStorage`
  (`src/infra/scoped-db/object-storage.ts`), nunca importa o SDK
  diretamente.
- `SupabaseHrAuditLogAdapter` → `hr_audit_logs` (estendida com
  `correlation_id`); uma falha ao gravar nunca propaga para o use case
  chamador (mesmo comportamento do legacy).
- `SupabaseWorkShiftRepository` / `SupabaseBaseScheduleRepository` /
  `SupabaseShiftRotationRepository` / `SupabaseHolidayReadAdapter` (RH-03) →
  `hr_work_shifts` (CRUD), `hr_base_schedule_templates`,
  `hr_shift_rotations`, `hr_public_holidays` (leitura), todos via
  `createScopedQuery`.
- `SupabaseShiftAttendanceReadAdapter` / `SupabaseLeaveReadAdapter` /
  `SupabasePaymentReadAdapter` (RH-01) → leitura direta via
  `createScopedQuery`, sem importar `hrShiftService.ts`/
  `hrShiftAttendanceService.ts`/`hrLeaveService.ts`/`hrPaymentService.ts`.
- `SupabaseDocumentCategoryRepository` → `hr_document_categories` via
  `createScopedQuery`.
- **"Melhorar Hoje na operação"**: nenhum adapter novo — `GetHrOverviewUseCase`/
  `ListShiftsToReviewUseCase`/`GetShiftToReviewUseCase` passaram a receber
  `SupabaseLocationRepository` (módulo `locations`, já existente), o mesmo
  adapter que `location-credentials` já reutiliza fora do seu módulo.

## Design decisions (ADR summary)

### Versionamento por nova linha, não tabela de histórico separada

Cada "substituir" cria uma nova linha em `hr_employee_documents` com
`version` incrementada e `previous_version_id` apontando para a anterior,
marcando-a `is_current=false`. Evita uma segunda tabela de histórico —
"a versão anterior" e "o histórico" são a mesma consulta
(`findVersionHistory`, ordenada por `version desc`).

### Foto em bucket privado com TTL longo

Diferente do documento (bucket privado, URL assinado de 120s, gerado
on-demand só quando o utilizador clica em download), a foto de perfil
precisa de aparecer em várias linhas de uma lista ao mesmo tempo — reassinar
a cada render seria caro. Optou-se por TTL de 1h (`PHOTO_SIGNED_URL_TTL_SECONDS`
em `application/use-cases/shared.ts`) em vez de um bucket público, por ser
dado pessoal (RGPD).

### Mascaramento de campos sensíveis por role

`hr_viewer` já existia como role no sistema de autenticação, mas nunca era
realmente diferenciado dentro do RH. Este módulo é o primeiro a aplicá-lo a
sério: IBAN/NIF/NISS/nº de identificação vêm mascarados para `hr_viewer`
(só os últimos 4 caracteres), completos para `manager`/`admin`.

### Listagem: paginação e filtro de situação documental em memória

`documentSituation` (ok/expiring/missing) é um campo **derivado**, calculado
a partir dos documentos atuais de cada colaborador — não existe como coluna.
Por isso o filtro por este campo (e a paginação subsequente) acontece em
memória, sobre um conjunto já limitado a um teto alto (`FIND_MANY_LIMIT =
500`) vindo do repositório. Não é uma paginação real de servidor para este
filtro específico — mesma abordagem (e mesma limitação) que a listagem
legacy de `hrEmployeeService.ts` já usava.

### Documentos obrigatórios e completude de perfil só se aplicam a colaboradores ativos

Um colaborador **inativo** não tem ações pendentes por definição — pedido
confirmado com o utilizador. Tanto `ListEmployeesUseCase` como
`GetEmployeeProfileUseCase` tratam `employee.status !== "active"` como um
caso especial: devolvem sempre `documentSituation: "ok"`,
`profileCompletionPercent: 100`, `sections` todas `true`,
`missingRequirements: []`, `expiringSoonCount: 0`, `alerts: []` e
`onboardingStatus: "completed"`, **independentemente** do estado real dos
dados/documentos. Não é um cálculo estatístico fraco — é uma decisão
deliberada de não gerar alerta/estado pendente para quem já saiu, mesmo que
o registo histórico continue incompleto. `GetPeopleKpisUseCase` e
`GetHrOverviewUseCase` já filtravam por `status: "active"` antes desta
mudança, por isso não precisaram de alteração. A listagem
(`PeopleListView.tsx`, frontend) mostra por omissão só ativos
(`status=active` no URL) — colaboradores inativos continuam pesquisáveis
trocando o filtro, mas nunca aparecem com badge de alerta.

### RH-01 — funcionalidades do mockup sem fonte real, deliberadamente omitidas

Descoberta exaustiva (2 agentes Explore) antes de implementar confirmou que
várias peças do mockup **não têm fonte de dados real hoje** — a própria
task RH-01 manda ocultar, não fabricar. Decisão, não bug:

- **"Férias por aprovar"** — `hr_leave_requests` não tem campo de estado
  (pending/approved/rejected); uma ausência é gravada como facto consumado.
  Sem workflow de aprovação real, este card não existe na resposta.
- **"Correções de ponto"** — não há um workflow de "pedido de correção"
  distinto da edição direta de conferência por um manager.
- **Filtro "Departamento"** — não existe nenhum conceito de departamento em
  todo o backend.
- **Filtro "Responsável pela conferência"** — não existe um campo de gestor
  responsável por colaborador/turno.
- **"Presente sem escala"** — `hr_shift_attendance.work_shift_id` é
  `NOT NULL` + `UNIQUE`: uma presença está sempre ligada 1:1 a um turno
  pré-existente. Não é possível, neste esquema, haver presença sem turno —
  a máquina de estados nunca produz esta exceção.
- **Turnos que atravessam a meia-noite** (ex: 22:00→06:00) — já não é uma
  omissão: a task "Novo Turno Padrão Semanal" introduziu `ends_next_day`
  (ver Domain concepts, `WorkShift`). Nota histórica só para não confundir
  quem procurar por este ponto numa versão antiga deste README.
- **Permissão por loja** ("utilizador só vê a sua loja") — não existe hoje
  nenhuma atribuição utilizador→loja (`req.auth` só tem `orgId`/`orgRole`).
  O filtro `locationId` da Visão Geral é uma conveniência do utilizador
  (só estreita o que já vê), não um limite de acesso aplicado — construir
  isso do zero seria uma mudança de arquitetura de autenticação, fora do
  âmbito de um dashboard.

### RH-01 — "Pagamentos pendentes" sem filtro de período

Decisão confirmada com o utilizador: conta **todos** os registos de
`hr_employee_payments` com `is_paid=false`, sem restringir por
`salaryPeriodYear/Month` — não existe hoje conceito de "período fechado".

### RH-01 — prioridade da fila "Turnos por conferir" é uma regra nova, documentada

O mockup não define uma fórmula determinística para Crítica/Alta/Média/Baixa
(exemplos ilustrativos inconsistentes entre si — um atraso de 18 min aparece
como "Crítica" e um de 45 min como "Alta"). `assignReviewPriority()` usa uma
regra própria, centralizada no domínio: severidade base pelo tipo de
exceção (sem saída/sem entrada = Alta; atraso/saída antecipada = Média; sem
exceção = Baixa), escalada para Crítica/Média quando o turno está por
conferir há mais de 24h.

### "Melhorar Hoje na operação" — sem limite de linhas, corte fica no frontend

A implementação anterior deste painel cortava a `MAX_OPERATION_ROWS = 5`
linhas — escondia deliberadamente o resto da equipa mesmo quando havia,
por exemplo, 8 colaboradores escalados. A task pede uma visão operacional
completa ("Quem está? Quem falta?..."), incompatível com um corte
arbitrário no backend. Decisão: o backend devolve **todos** os
colaboradores com turno/ausência hoje, já ordenados por prioridade; é o
frontend que decide como caber isso num espaço pequeno (scroll interno em
vez de paginação — ver README do frontend).

### "Melhorar Hoje na operação" — Estado de exibição não reutiliza o `ShiftState` interno

`computeOperationDisplayState()` é uma função **nova**, não uma alteração
a `computeShiftState()` — ambas coexistem. Uma alternativa seria renomear
`ATRASADO_AGUARDANDO_ENTRADA`/`AUSENTE_OPERACIONAL` diretamente no enum
partilhado, mas isso mudaria a semântica de `ShiftState` para todo o resto
do módulo (alertas, "Turnos por conferir", `computeConflictEmployeeIds`),
que não pediram esta mudança de nomenclatura. Duas funções pequenas e
claras, cada uma com o seu público, em vez de forçar um nome só para
agradar a um painel.

### "Melhorar Hoje na operação" — Intervalo é só uma sobreposição de exibição, não um estado persistido

Não há nenhuma coluna nova nem tabela de "pausas" — `INTERVALO` é
calculado em runtime, comparando `now` com o fim do 1º período e o início
do 2º de um turno repartido já existente (`hr_work_shifts.second_start_time`).
Nunca é gravado, nunca aparece em `hr_shift_attendance`, e não afeta em
nada a lógica de conferência/alertas (que continuam a olhar só para o
início e fim do turno completo).

### "Melhorar Hoje na operação" — drill-down direto em vez de reaproveitar a lista paginada

Em vez de estender `ListShiftsToReviewUseCase`/o ecrã `ShiftsToReviewView`
para aceitarem filtros por URL (`employeeId`+`workDate`+`shiftId`) e ligar
"Hoje na operação" a essa rota, criou-se `GetShiftToReviewUseCase` — busca
1 turno pelo id diretamente. Mais simples dos dois lados: o backend não
precisou de mexer no contrato de paginação/filtros já usado por outro
ecrã, e o frontend abre a `ShiftReviewModal` sem primeiro montar/gerir uma
lista paginada só para extrair 1 item dela.

### "Hoje na operação refinado" — `situationWarning` como linha secundária persistente

Antes desta ronda, "Situação" era 1 única string derivada só do Estado
atual — um colaborador que faltou ao 1º período de um turno repartido mas
entrou no 2º acabava mostrado como `PRESENTE`/"Entrada 18:02" sem nenhum
rasto da inconsistência anterior (caso "Lucas Almeida", task, secção 6/7).
`describeSituation()` passou a devolver `{situation, situationWarning}`
(`SituationDescription`) em vez de uma string: `situationWarning` é `null`
na generalidade dos casos, e só é preenchido quando há uma inconsistência
que deve continuar visível mesmo depois de o Estado atual já não a
refletir. `OverviewOperationRowDTO.situationWarning` (e o `hasOccurrence`
usado por `urgencyRank`) seguem o mesmo padrão. Alternativa descartada:
embutir o aviso dentro da própria `situation` (ex: "Entrada 18:02 · 1º
turno sem entrada") — perderia a distinção visual/clicável entre as duas
linhas que o frontend precisa de desenhar.

### "Hoje na operação refinado" — correção: intervalo entre períodos só é `INTERVALO` se houve entrada no 1º período

`computeOperationDisplayState()` sobrepunha sempre `INTERVALO` durante o
intervalo de um turno repartido, mesmo quando o colaborador nunca chegou
para o 1º período — indistinguível de quem cumpriu o 1º período e está
apenas de pausa. Corrigido para verificar `shift.actualStartTime`: com
entrada registada, mantém-se `INTERVALO` (presume-se presente, à espera do
2º período); sem entrada, passa a `AUSENTE` (nunca apareceu). `describeSituation()`
acompanha a distinção: `AUSENTE` durante o intervalo mostra "1º turno sem
entrada · Próximo às HH:mm" (ainda dá a hora do 2º período, para se saber
quando o alerta deixa de fazer sentido); depois do fim do 2º período,
"Sem entrada" simples (já não há mais nada a esperar).

### "Hoje na operação refinado" — ambiguidade da task entre os casos "1º período sem entrada" (secção 7)

A task ilustra dois casos com o mesmo padrão (entrada registada perto do
início do 2º período de um turno repartido) mas com resultados
aparentemente opostos: um exemplo com entrada às 18:02 mostra o aviso "1º
turno sem entrada"; outro com entrada às 17:58 (2 min mais cedo) não
mostra aviso nenhum. A task não distingue os dois de forma verificável (não
há um 2º carimbo de entrada por período — só existe 1 `actualStartTime` por
turno). Decisão: uma única regra consistente — `situationWarning` é
preenchido sempre que `actualStartTime >= endTime` do 1º período (ou seja,
a entrada aconteceu depois de o 1º período já ter oficialmente terminado),
replicando o exemplo das 18:02. Se o utilizador confirmar que o corte real
devia ser outro (ex: relativo ao início do 2º período, não ao fim do 1º),
é um ajuste de 1 linha em `describeSituation()`.

### "Hoje na operação refinado" — ordenação segue a lista numerada da secção 13, não o exemplo da secção 14

A secção 13 da task dá uma lista numerada explícita de prioridade
(Conflito > Ausente > Atrasado > outras inconsistências > presente com
ocorrência > presente > em tolerância > agendado > intervalo > férias/
baixa/folga > finalizado). O exemplo ilustrativo da secção 14 mostra
"Em tolerância" antes de "Presente com ocorrência" — o oposto do que a
própria lista numerada define. `GetHrOverviewUseCase.urgencyRank()` segue
a lista numerada (a regra explícita), não o exemplo (ilustrativo); a
mudança visível é `INTERVALO` passar do rank 6 (entre Presente e Em
tolerância, ajuste de bom senso da ronda anterior) para o rank 8 (abaixo
de Agendado), conforme a nova lista. Ver comentário em `urgencyRank()`.

### "Hoje na operação refinado" — `shiftToday` passa a juntar todos os turnos do dia, nunca duplicar a linha

Antes, com 2+ turnos do mesmo colaborador no mesmo dia (raro — o caso
comum de turno repartido já é 1 só registo com 2 períodos), `shiftToday`
só mostrava o horário do turno "representativo" escolhido para o Estado —
os restantes ficavam invisíveis. Agora junta `describeShiftSchedule()` de
**todos** os turnos do dia desse colaborador, ordenados por hora de
início, numa lista só. "Um funcionário = uma linha" (task, secção 1)
continua garantido: `byEmployee` já agrupa por `employeeId` antes disto,
só o conteúdo da célula "Turno hoje" é que passou a ser mais completo.

### "Melhorar Visão Geral e reorganizar Pessoas" — `GetDocumentOverviewUseCase` reaproveita a lógica, não a agregação, de `GetPeopleKpisUseCase`

As duas continuam use cases separados, cada um com a sua orquestração
(loop por colaborador, chamadas aos mesmos 3 repositórios) — mas ambas
chamam as MESMAS funções puras do domínio (`applicableCategoriesFor`,
agora também `computeDocumentRequirementRows`, que generaliza
`computeMandatoryDocumentsSummary` para incluir também as categorias
opcionais e os estados "válido"/"a expirar"/"expirado", não só "em
falta"). Alternativa descartada: fazer `GetDocumentOverviewUseCase` chamar
`GetPeopleKpisUseCase` internamente — os dois têm formas de agregação
genuinamente diferentes (1 linha por colaborador vs. 1 linha por
colaborador×requisito) e forçar um a depender do outro só para "não
duplicar" trocaria uma duplicação pequena e visível (2 loops parecidos)
por um acoplamento maior entre 2 casos de uso com propósitos distintos.

### "Melhorar Visão Geral e reorganizar Pessoas" — drawer da Visão Geral reaproveita `GetPeopleKpisPort`, não uma rota nova

O pedido era "centralizar os resumos de pendências na Visão Geral" e
"remover duplicações entre Visão Geral e Pessoas" — a duplicação real era
o painel "Pendências prioritárias" existir em 2 sítios (Pessoas E,
implicitamente, a Visão Geral). Em vez de criar uma rota/DTO novo só para
o drawer, o frontend chama `GET /api/hr/people/kpis` a partir da própria
Visão Geral (mesma `queryKey` do React Query que "Pessoas" já usava) e
filtra `priorityPendencies` pelo `kind` clicado — 1 única fonte, 2 pontos
de entrada. `OverviewTeamDTO` só ganhou a CONTAGEM de "Documentos em
falta" (`missingDocumentsCount`), não a lista agrupada — o detalhe
continua a vir de `GetPeopleKpisPort`, nunca duplicado ali.

### "Melhorar Visão Geral e reorganizar Pessoas" — Admissão fica fora desta ronda

A task original pedia uma 3ª aba "Admissão" dentro de "Pessoas"
(acompanhamento de checklist de onboarding). O utilizador pediu
explicitamente para ignorar essa parte "não vejo necessário na nossa
operação" — nada foi construído para isso (nem endpoint, nem aba, nem
componente). `PeopleTabs` só tem Colaboradores/Documentos. Se vier a ser
pedida no futuro, o `onboardingPending` KPI (já existente em
`GetPeopleKpisPort`) já dá o ponto de partida para a contagem.

### RH-03 — `status`/`source` como único par de campos para tudo

Em vez de tabelas/colunas separadas para "rascunho vs. publicado" e para
"proteção contra reaplicação", `hr_work_shifts.source` faz dupla função:
proveniência (para auditoria/depuração) **e** flag de proteção (qualquer
`source !== "base_schedule"/"rotation"` é tratado como exceção manual,
intocável por reaplicações). Uma edição interativa marca sempre `manual`,
mesmo que o turno tivesse sido gerado por escala base/rotação — a partir
desse momento, fica "adotado" pelo manager e protegido. Mais simples do que
um booleano `locked` adicional, com o mesmo efeito prático.

### RH-03 — escala base e rotação nunca convergem no mesmo turno

Um turno com `source="rotation"` só é reescrito por uma reaplicação da
**mesma** rotação (`rotation_id` bate certo); a aplicação de escala base
trata-o como exceção manual (é `!== "base_schedule"`), nunca o sobrescreve
mesmo com `overrideExceptions=true` — essa flag só existe no lado da escala
base. Rotações não têm equivalente a `overrideExceptions`: a task pede
"nunca reescrever histórico silenciosamente" para rotações sem qualificar
uma exceção a essa regra, ao contrário da escala base, que explicitamente
permite confirmação. Assimetria deliberada, não esquecimento.

### "Novo Turno Padrão Semanal" — série via tag partilhada, sem tabela pai

`series_id` é só uma coluna UUID em `hr_work_shifts`, sem tabela pai —
"editar/limpar toda a série" é uma simples consulta `WHERE series_id = ?`.
Evita o over-engineering de uma entidade `ShiftSeries` para um conceito que,
na prática, só precisa de agrupar linhas já existentes. Uma série nunca é
"apagada" enquanto conceito — deixa de ter membros quando todos os turnos
são destacados/apagados individualmente, e isso é suficiente.

### "Novo Turno Padrão Semanal" — conflitos reportados, nunca bloqueiam

Uma ocorrência que sobrepõe um turno existente **não** lança um erro —
`CreateWorkShiftSeriesUseCase` cria só as disponíveis por omissão e devolve
as conflituosas na resposta (`conflicts: PlannedOccurrenceDTO[]`), para o
frontend mostrar "18 disponíveis · 2 conflitos" e o utilizador decidir. Só
com `force: true` explícito é que os conflitos também são persistidos —
férias/ausência/feriado nunca são forçáveis, por serem exclusões absolutas.
(Chegou a existir um `ShiftSeriesConflictsError` a meio da implementação;
foi removido — bloquear com uma exceção contradiria a redação literal da
task.)

### "Novo Turno Padrão Semanal" — sem chave de idempotência dedicada

Um duplo-submit do mesmo padrão não tem proteção por chave/token — a
proteção vem de graça da própria deteção de sobreposição: a segunda
chamada deteta os turnos já criados na primeira como `conflicts` e não cria
nada a mais (resultado seguro, não-destrutivo, só nunca é "0 duplicados
criados por acaso" — é sempre determinístico). Decisão de âmbito: uma
tabela de idempotência dedicada ficaria para se este comportamento se
revelar insuficiente na prática.

### "Novo Turno Padrão Semanal" — corpo dos novos endpoints não é validado campo a campo

Ao contrário do resto do controller (`hr-schedules.controller.ts`), os
corpos de `rules`/`repeat`/`scope` das 4 rotas novas são só type-cast
(`as never`) em vez de validados propriedade a propriedade — a forma
aninhada (regras × segmentos × modos de repetição × âmbitos de scope) não
segue o padrão simples dos outros endpoints. A validação de negócio real
continua a acontecer nos use cases (`InvalidRecurrenceSpecError`,
`WorkShiftNotInSeriesError`), só a validação de forma do JSON de entrada é
mais fraca. Dívida documentada, não escondida — ver Known gaps.

### "Repetir escala pelo calendário" — "Copiar semana" repensado como "Alternar turnos"

O utilizador notou que "Copiar semana" e "Repetir escala" faziam
literalmente a mesma coisa (duplicação sem propósito próprio). Decisão:
`rotateEmployees?: boolean` no mesmo comando — quando `true`, em vez de
cada colaborador repetir o seu próprio horário, cada um recebe o horário
do **seguinte** na lista `employeeIds` (ordem dada pelo pedido), com
"wrap-around" no fim (`buildRotationMap`, `repeat-calendar-week-shared.ts`).
Com 2 colaboradores é uma troca simples (pedido concreto do utilizador:
"na semana seguinte... inverter o horário" de Carlos e Kleiton); com 3+ é
uma rotação circular — generalização natural, não pedida explicitamente
mas coerente com o mesmo mecanismo. Exige pelo menos 2 colaboradores
selecionados (`InvalidRecurrenceSpecError` caso contrário). Reaproveita
100% do resto do motor (`computeSeriesPartition` por grupo) — só troca
QUAL colaborador recebe as regras de qual grupo, a detecção de conflito
continua a verificar a agenda do colaborador **de destino** (correto:
"o Kleiton já tem algo marcado quando lhe vamos dar o horário do
Carlos?").

### "Repetir escala pelo calendário" — 1 série por (colaborador, local), nunca partilhada entre colaboradores

Ao contrário do que a leitura literal da task poderia sugerir ("os turnos
criados na mesma operação devem ficar relacionados entre si"), optou-se
por **não** dar um único `series_id` a todos os colaboradores da operação.
`seriesId` já tem uma semântica bem estabelecida (1 série = 1 colaborador,
usada por "editar toda a série"/"limpar toda a série" via
`findBySeriesId`) — partilhar entre colaboradores quebraria essa premissa
(editar "toda a série" de um colaborador afetaria acidentalmente outro).
A rastreabilidade "vieram da mesma operação de repetição" existe através
da descrição do registo de auditoria (`sourceWeekStartDate` + `actor` +
`correlationId` por colaborador), suficiente para o objetivo da task
("rastrear a origem"), sem violar a semântica já existente.

### "Repetir escala pelo calendário" — reaproveita `computeSeriesPartition`, sem motor novo

Em vez de construir um segundo motor de recorrência/conflito para "vários
colaboradores de uma vez", `repeat-calendar-week-shared.ts` transforma os
turnos reais da semana de origem no MESMO formato (`WeeklyDayRule[]`) que
"Novo Turno Padrão Semanal" já usa, e chama a mesma `computeSeriesPartition`
uma vez por (colaborador, local). Zero lógica de domínio nova — só
orquestração (agrupar, converter, chamar, agregar). Cumpre literalmente o
pedido da task ("não reconstruir manualmente um turno se já existir uma
entidade/serviço próprio para isso").

### "Repetir escala pelo calendário" — só "manter existente", sem "substituir"

A task pede 3 tratamentos de conflito ("Manter existente" / "Não criar
nesta data" / "Substituir existente, somente se já houver suporte/
autorização para isso"). Os dois primeiros são o mesmo resultado prático
(não criar) — é o comportamento por omissão. "Substituir" **não** foi
implementado: não existe hoje nenhum primitivo de "apagar e recriar
atomicamente" no domínio, e a própria task condiciona isto a "já haver
suporte", que não há. `force: true` (já existente, reaproveitado de "Novo
Turno Padrão Semanal") cria o turno novo **ao lado** do existente
(sobreposição permitida deliberadamente), nunca apaga o antigo — não é um
"substituir", é a mesma válvula de escape já documentada nesse outro
sítio.

### RH-03 — "Falta de cobertura" só existe em relação à escala base

A task pede um alerta de "falta de cobertura" sem definir de onde vem a
cobertura esperada. Decisão: usar a escala base como a única fonte de
"quantas pessoas deviam trabalhar" — sem ela configurada para um
colaborador, não há alerta para ele (não fabricar uma expectativa de
cobertura a partir do nada). Isto também significa que a "cobertura"
raciocina por colaborador, não por "a loja X precisa de N pessoas às
terças" (esse segundo conceito não existe em lado nenhum do sistema).

## How to test

- Domínio/use cases: `npx jest src/modules/hr --testPathIgnorePatterns=integration`
  (rápido, com fakes — sem BD nem rede).
- Todos os testes: `npm test`.
- Lint de fronteiras: `npx depcruise src/modules/hr --config .dependency-cruiser.cjs`.

## Known gaps / open debt

- **"Melhorar Visão Geral e reorganizar Pessoas" — Admissão não construída**
  (pedido explícito do utilizador para ignorar essa parte desta ronda) —
  ver "Design decisions".
- **`GetDocumentOverviewUseCase` simplifica `pending_validation`/
  `rejected`/`removed` para `"missing"`** na aba "Pessoas > Documentos" —
  o detalhe completo desses estados continua só no perfil do colaborador
  (`EmployeeDocumentsTab`). Ver comentário em `DocumentRequirementRow`.
- **`GetDocumentOverviewUseCase` não pagina** — devolve todas as linhas de
  uma vez (colaboradores ativos × requisitos aplicáveis). Aceitável para o
  volume de equipa desta organização; precisaria de paginação server-side
  se a equipa crescesse muito.
- **`EXPIRING_SOON_DAYS`** continua uma constante fixa do módulo, não
  configurável por organização — mudar o prazo de "a expirar" ainda é editar
  `document-status.service.ts`, não uma tela.
- **O grupo "Documento de identificação"** (Cartão de Cidadão OU Título de
  Residência OU Passaporte, `DEFAULT_MANDATORY_REQUIREMENTS`) continua fixo
  no código, propositadamente fora da tela "Categorias de documentos" —
  decisão confirmada com o utilizador (não vale a pena a complexidade de
  gerir grupos "ou" pela UI só para este caso único).
- **Checklist de onboarding** do mockup (Documentos entregues / Contrato
  assinado / Formação de segurança / Fardamento / Acessos) não tem uma
  tabela de estado própria nesta fase — `onboardingStatus` no perfil é só
  `"completed" | "pending"`, derivado de completude de perfil + documentos
  obrigatórios em falta, sem itens individuais marcáveis.
- **Sem "delta vs. mês anterior"** nos KPIs (o mockup mostra "+2 vs. Julho
  2026") — exigiria uma tabela de snapshot histórico que não existe; os
  KPIs devolvem só o valor atual.
- ~~Bucket `hr-photos` e a migração (`20260926120000_hr_people_documents.sql`)
  ainda não foram aplicados~~ — aplicados e confirmados (2026-09-27,
  verificado diretamente: bucket `hr-photos` existe no storage; `hr_employees.
  photo_storage_path/job_role` e `hr_employee_documents` presentes na BD).
- ~~Frontend da RH-01 (Visão Geral + drill-down) ainda não existe~~ —
  desatualizado, o frontend da RH-01 (`OverviewView.tsx` e afins) já existe
  e foi melhorado pela task "Melhorar Hoje na operação"; nota histórica só
  para não confundir quem procurar por este ponto numa versão antiga deste
  README.
- **RH-01 — filtro por loja não é um limite de acesso** (ver acima) — se no
  futuro este sistema ganhar atribuição utilizador→loja, o `locationId` da
  Visão Geral terá de passar a ser validado contra as lojas do utilizador,
  não só aceite como veio do pedido.
- **RH-01 — "Turnos por conferir" só procura nos últimos 30 dias**
  (`REVIEW_LOOKBACK_DAYS`) — um turno por conferir há mais tempo do que
  isso não aparece na fila; simplificação para evitar carregar todo o
  histórico de turnos.
- **RH-01 — timezone único (`Europe/Lisbon`)** — `Location.timezone` existe
  na entidade mas nunca é lido em lado nenhum do sistema (confirmado por
  grep); a Visão Geral segue a mesma convenção já usada por todo o código
  de turnos/kiosk. Se a Fonsat operar lojas noutro fuso, isto exigiria
  passar a ler `location.timezone` em vez do `REPORT_TIMEZONE` global —
  fora do âmbito desta task.
- **RH-01 — cobertura de testes**: os casos mais representativos de cada
  categoria da secção 14 da task foram cobertos (contagens, turno
  cancelado, atraso dentro/fora da tolerância, conflito de presenças,
  férias a cobrir ausência, falha parcial de uma fonte, não-mutação
  estrutural). Não é uma cobertura exaustiva de todas as combinações
  listadas na task (ex: mudança de horário de verão/inverno não tem teste
  dedicado) — dívida a fechar se surgirem bugs reais de timezone.
- **RH-03 — "Pedidos de troca" omitido, mesma categoria das omissões RH-01**:
  não existe hoje nenhuma tabela/fluxo de "pedido de troca de turno" entre
  colaboradores, nem um portal self-service para colaboradores originarem
  esse pedido (o sistema é 100% dashboard de gestor). O painel de alertas
  não inclui este item — fabricar um workflow sem fonte real violaria a
  mesma regra já aplicada em "Férias por aprovar"/"Correções de ponto"
  (RH-01). Se o negócio quiser isto a sério, é uma task própria (schema +
  possivelmente um portal do colaborador).
- **RH-03 — "Pausar" e "Desativar" uma rotação são o mesmo estado**: o
  mockup distingue os dois verbos; o modelo de dados só tem um booleano
  `active`. Simplificação deliberada para o MVP — reintroduzir a distinção
  exigiria um terceiro estado (ex: `paused_until`) sem um requisito
  funcional claro sobre o que a diferença deveria fazer na prática.
- **RH-03 — rotação limitada a exactamente 2 participantes** (MVP da
  própria task: "arquitetura extensível para mais participantes"). O array
  `participant_employee_ids` e os 2 padrões fixos (A/B) não generalizam
  hoje para 3+ colaboradores — precisaria de um modelo de N padrões e uma
  regra de alternância diferente (round-robin em vez de troca binária).
- **RH-03 — sem UI de "aplicar escala base a todos os colaboradores de
  uma vez"** — `ApplyBaseSchedulePort` opera sobre 1 colaborador de cada
  vez (mesmo aos moldes do mockup, "Aplicar esta escala à semana" no
  contexto de 1 colaborador selecionado no filtro). Aplicar a vários ao
  mesmo tempo ficaria a cargo do frontend chamar o endpoint em loop, não do
  backend.
- ~~RH-03 — migração ainda não aplicada (`20260926180000_hr_schedules.sql`)~~
  — aplicada e confirmada (2026-09-27, verificado diretamente na BD real:
  `hr_work_shifts.status/source/break_minutes/rotation_id`,
  `hr_base_schedule_templates`, `hr_shift_rotations` todos presentes).
- **"Novo Turno Padrão Semanal" — repartido + noturno mutuamente
  exclusivos nesta V1**: um turno não pode ser ao mesmo tempo "2 períodos"
  e "atravessa a meia-noite" (`assertShape` rejeita a combinação). A task
  não pedia este caso explicitamente; generalizar exigiria repensar como um
  2º período se ancora quando o 1º já passou para o dia seguinte — fica
  para se surgir um pedido real.
- ~~"Novo Turno Padrão Semanal" — migração ainda não aplicada
  (`20260927120000_hr_shift_series.sql`)~~ — aplicada e confirmada
  (2026-09-27, verificado diretamente na BD real: `hr_work_shifts.series_id/
  ends_next_day/second_start_time/second_end_time` todos presentes). Teste
  manual em ambiente real continua bloqueado por falta de acesso a browser
  nesta sessão.
- **"Novo Turno Padrão Semanal" — sem chave de idempotência dedicada** e
  **validação de corpo simplificada** para os 4 endpoints novos — ver Design
  decisions acima.
- ~~"Novo Turno Padrão Semanal" — frontend ainda não implementado~~ —
  desatualizado, o frontend (`ShiftSeriesForm.tsx`, prompt de âmbito no
  `ShiftDrawer.tsx`, `ClearShiftsModal.tsx`) já foi implementado; ver README
  do frontend para as decisões de design desse lado.
- **"Melhorar Hoje na operação" — sem testes automatizados novos além dos
  já escritos nesta ronda**: `overview-shift-state.service.test.ts` (as
  novas funções) e `get-hr-overview.test.ts`/`get-shift-to-review.test.ts`
  (o bloco `operation` e o novo use case) cobrem os casos principais
  (CONFLITO, FERIAS com "Até DD/MM", sem corte de linhas, resolução de
  local, `reviewShiftId`), mas não testam exaustivamente todas as
  combinações de `computeOperationDisplayState`/sort para cada estado
  possível — dívida aceitável dado o volume do resto da task.
- ~~"Melhorar Hoje na operação" — "outras inconsistências" e a posição de
  `INTERVALO`/`FINALIZADO` na ordenação são uma extensão razoável~~ —
  superado pela task "Hoje na operação refinado" (secção 13), que dá uma
  lista numerada explícita cobrindo os dois; ver "Design decisions" acima
  para a posição final e a contradição entre a secção 13 e o exemplo da
  secção 14.
- **"Hoje na operação refinado" — sem testes automatizados para todas as
  combinações possíveis do case-3-vs-case-5 da secção 7**: cobrem-se os
  cenários principais (Intervalo com/sem entrada, Ausente durante e depois
  do intervalo, Atrasado no 2º período, Presente com/sem aviso) em
  `overview-shift-state.service.test.ts`/`get-hr-overview.test.ts`, mas não
  uma combinatória exaustiva de todos os estados × turno repartido/não
  repartido/noturno — dívida aceitável dado o volume da task.
- **"Melhorar Hoje na operação" — migração já aplicada, sem migração
  nova**: esta task não precisou de nenhuma alteração de esquema — só leu
  colunas que a migração da RH-03/"Novo Turno Padrão Semanal" já tinha
  criado (`ends_next_day`, `second_start_time`, `second_end_time`).
- **"Melhorar Turnos Rotativos" — migração pendente**
  (`20260927140000_hr_shift_rotations_split.sql`) — fica pendente da mesma
  autorização/aplicação manual (Raul) já usada nas migrações anteriores
  desta sessão. Até lá, criar uma rotação com turno repartido falha em
  runtime (colunas `pattern_a_second_start_time`/etc. não existem ainda).
- **"Melhorar Turnos Rotativos" — só turno repartido, âmbito confirmado
  com o utilizador**: turno noturno, 3+ participantes e edição de uma
  rotação já criada (além de pausar/retomar) ficaram deliberadamente fora
  desta ronda — pedido explícito de não alargar o âmbito além do turno
  repartido + melhor pré-visualização.
- **"Repetir escala pelo calendário" — migração já aplicada, sem migração
  nova**: só leu/reaproveitou colunas e conceitos já existentes
  (`hr_work_shifts.series_id`/`ends_next_day`/etc., o motor de
  `computeSeriesPartition`).
- ~~"Repetir escala pelo calendário" — "Copiar semana" é um atalho, não um
  fluxo próprio~~ — revisto: o utilizador notou que "Copiar semana" e
  "Repetir escala" faziam a mesma coisa; "Copiar semana" passou a
  pré-ligar `rotateEmployees` (alternar/trocar horários entre
  colaboradores, período pré-definido para 1 semana), dando-lhe um
  propósito próprio — ver Design decisions ("Copiar semana" repensado
  como "Alternar turnos").
- **"Repetir escala pelo calendário" — sem testes automatizados de UI**
  para `RepeatScheduleWeekModal.tsx`/o menu "Ações da semana" — mesma
  dívida já aceite para o resto do módulo. Teste manual em ambiente real
  bloqueado por falta de acesso a browser nesta sessão.
- **"Alternar turnos" (`rotateEmployees`) — sem migração nova**: reaproveita
  100% o esquema/motor já existente, só muda a orquestração de qual
  colaborador recebe qual grupo de regras.
- **"Visualização Detalhada e Compacta" e a correção do turno repartido
  no calendário (2º período não aparecia) — sem alterações no backend**:
  ambas as tasks são só de apresentação no frontend (dados já vinham
  corretos do backend desde "Novo Turno Padrão Semanal" —
  `secondStartTime`/`secondEndTime` já existiam no `WorkShiftDTO`, só não
  eram todos mostrados no calendário). Ver README do frontend.
