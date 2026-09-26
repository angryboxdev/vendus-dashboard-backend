# Module: hr

> Status: active
> Last updated: 2026-09-26

---

## What it is and what it's for (business perspective)

Módulo **Pessoas & Documentos** (RH-02) + **Visão Geral operacional** (RH-01).
Trata o cadastro de colaboradores e o dossiê documental de cada um como a
fonte operacional de RH — substitui a antiga entrada "Funcionários" por uma
vista com sinais de completude de perfil, onboarding e situação documental,
mais um perfil 360º por colaborador — e agrega, só em leitura, KPIs de
equipa/operação do dia/pendências a partir de dados reais já existentes
(turnos, presença, férias, pagamentos).

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
histórico de auditoria com actor real, mais `/api/hr/overview*` (RH-01) que
agrega, **só leitura**, KPIs/alertas/snapshot a partir dos dados reais de
turnos/presença/férias/pagamentos — nunca recalcula nem altera esses dados,
só lê e resume. **Não é responsabilidade deste módulo**: gerir turnos, ponto,
férias, pagamentos, kiosk — esses continuam 100% geridos pelo código legacy
(`src/routes/hrRoutes.ts` e afins); este módulo só os **lê**.

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
  `removed`) e resume as categorias obrigatórias vs. as existentes
  (`computeMandatoryDocumentsSummary`). `DEFAULT_MANDATORY_CATEGORIES` é uma
  constante do módulo — **não configurável por organização nesta fase**
  (dívida conhecida, ver abaixo). `EXPIRING_SOON_DAYS = 30` é igualmente uma
  constante fixa.
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
  mockup RH-01), não configurável por organização.
- **`overview-kpi.service`** — agrega turnos de um dia em contagens de
  **pessoas únicas** (nunca turnos) para Escalados/Presentes/Atrasos/
  Ausentes — 2 turnos da mesma pessoa contam 1.
- **`overview-alert.service`** — `prioritizeAndDedupAlerts()` centraliza a
  matriz de prioridade (`CRITICA > ALTA > MEDIA > BAIXA`, depois
  antiguidade/data, depois id) — nunca no frontend.

## Ports

### Input (use cases)

- `ListEmployeesPort` / `GetPeopleKpisPort` / `GetEmployeeProfilePort` —
  leitura da lista, dos KPIs+pendências prioritárias, e do perfil 360º.
- `CreateEmployeePort` / `UpdateEmployeePort` / `SetEmployeeStatusPort` /
  `UploadEmployeePhotoPort` — escrita de colaborador.
- `GetEmployeeHistoryPort` — histórico agregado de auditoria de um
  colaborador.
- `ListEmployeeDocumentsPort` / `UploadEmployeeDocumentPort` /
  `ReplaceEmployeeDocumentPort` / `RemoveEmployeeDocumentPort` /
  `GetEmployeeDocumentDownloadUrlPort` / `GetEmployeeDocumentHistoryPort` —
  dossiê documental (upload de categoria nova, substituir versão, remoção
  lógica, URL de download, histórico de versões).
- `GetHrOverviewPort` (RH-01) — KPIs/alertas/snapshot do dia, com blocos
  independentes `team`/`today`/`pending`/`alerts`/`operation`, cada um
  `{status: "ok", data} | {status: "unavailable", reason}` — uma fonte
  falhar nunca derruba as outras nem vira `0` silenciosamente.
- `ListShiftsToReviewPort` (RH-01) — fila "Turnos por conferir" paginada,
  filtrada por prioridade/local/pesquisa.

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
  interfaces, não só por convenção).

## Adapters

### Input

- `HrPeopleController` → expõe os use cases em `/api/hr/people*` (ver tabela
  de rotas no plano/PR). GETs permitidos a `hr_viewer`+; escritas exigem
  `requireMinRole("manager")` inline, mesmo padrão do `hrRoutes.ts` legacy.
- `HrOverviewController` (RH-01) → `GET /api/hr/overview` e
  `GET /api/hr/overview/shifts-to-review`, ambos só leitura, `hr_viewer`+.
  A confirmação de conferência **não** tem rota aqui — continua a usar o
  endpoint legacy `PATCH /api/hr/shifts/:id/attendance`.

### Output

- `SupabaseEmployeeRepository` / `SupabaseEmployeeDocumentRepository` →
  `hr_employees`/`hr_employee_documents` via `createScopedQuery`.
- `SupabaseHrFileStorageAdapter` → delega para `objectStorage`
  (`src/infra/scoped-db/object-storage.ts`), nunca importa o SDK
  diretamente.
- `SupabaseHrAuditLogAdapter` → `hr_audit_logs` (estendida com
  `correlation_id`); uma falha ao gravar nunca propaga para o use case
  chamador (mesmo comportamento do legacy).
- `SupabaseShiftAttendanceReadAdapter` / `SupabaseLeaveReadAdapter` /
  `SupabasePaymentReadAdapter` (RH-01) → leitura direta via
  `createScopedQuery`, sem importar `hrShiftService.ts`/
  `hrShiftAttendanceService.ts`/`hrLeaveService.ts`/`hrPaymentService.ts`.

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
- **Turnos que atravessam a meia-noite** (ex: 22:00→06:00) — a BD tem uma
  check constraint `start_time < end_time` no mesmo dia civil; este tipo de
  turno não pode ser guardado hoje. Decisão confirmada com o utilizador:
  fora de âmbito — mudar isto é uma migração de esquema maior, pertence a
  uma task própria de Escalas.
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

## How to test

- Domínio/use cases: `npx jest src/modules/hr --testPathIgnorePatterns=integration`
  (rápido, com fakes — sem BD nem rede).
- Todos os testes: `npm test`.
- Lint de fronteiras: `npx depcruise src/modules/hr --config .dependency-cruiser.cjs`.

## Known gaps / open debt

- **`DEFAULT_MANDATORY_CATEGORIES` e o threshold `EXPIRING_SOON_DAYS`** são
  constantes fixas do módulo, não configuráveis por organização — uma
  organização diferente da Angry Box não pode hoje definir as suas próprias
  categorias obrigatórias nem o seu próprio prazo de "a expirar".
- **Checklist de onboarding** do mockup (Documentos entregues / Contrato
  assinado / Formação de segurança / Fardamento / Acessos) não tem uma
  tabela de estado própria nesta fase — `onboardingStatus` no perfil é só
  `"completed" | "pending"`, derivado de completude de perfil + documentos
  obrigatórios em falta, sem itens individuais marcáveis.
- **Sem "delta vs. mês anterior"** nos KPIs (o mockup mostra "+2 vs. Julho
  2026") — exigiria uma tabela de snapshot histórico que não existe; os
  KPIs devolvem só o valor atual.
- **Bucket `hr-photos`** e a migração (`20260926120000_hr_people_documents.sql`)
  ainda não foram aplicados à base de dados real — precisam de autorização
  explícita antes de qualquer ligação direta à BD de produção (mesma regra
  pontual já usada nas migrações anteriores desta sessão).
- **Frontend da RH-02** já existe (Fase 2); **frontend da RH-01** (Visão
  Geral + drill-down) ainda não — este trabalho cobre só o backend.
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
