import { ENV } from "./config/env.js";
import cors from "cors";
import { documentsRoutes } from "./routes/documentsRoutes.js";
import { dreRoutes } from "./routes/dreRoutes.js";
import express from "express";
import { createInternalCronRouter } from "./routes/internalCronRoutes.js";
import { pizzaRoutes } from "./routes/pizzaRoutes.js";
import { preparationRoutes } from "./routes/preparationRoutes.js";
import { reportsRoutes } from "./routes/reportsRoutes.js";
import { stockRoutes } from "./routes/stockRoutes.js";
import { hrRoutes } from "./routes/hrRoutes.js";
import { hrKioskRoutes } from "./routes/hrKioskRoutes.js";
import { hrAuditRoutes } from "./routes/hrAuditRoutes.js";
import { hrLeaveRoutes } from "./routes/hrLeaveRoutes.js";
import { createCashClosingsModule } from "./modules/cash-closings/cash-closings.module.js";
import { createKdsModule } from "./modules/kds/kds.module.js";
import { createFinancialBaseModule } from "./modules/financial-base/financial-base.module.js";
import { createInvoicesModule } from "./modules/invoices/invoices.module.js";
import { createPayableEntriesModule } from "./modules/payable-entries/payable-entries.module.js";
import { createPayableRecurrencesModule } from "./modules/payable-recurrences/payable-recurrences.module.js";
import { createBankAccountsModule } from "./modules/bank-accounts/bank-accounts.module.js";
import { createBankStatementsModule } from "./modules/bank-statements/bank-statements.module.js";
import { createAirMenuModule } from "./modules/air-menu/air-menu.module.js";
import { createVendusModule, resolveVendusBootConfig } from "./modules/vendus/vendus.module.js";
import { setVendusApiKey } from "./infra/vendusClient.js";
import { SupabaseAirMenuCredentialsRepository } from "./modules/air-menu/adapters/out/supabase-air-menu-credentials.repository.js";
import { SupabaseAirMenuLocationConfigRepository } from "./modules/air-menu/adapters/out/supabase-air-menu-location-config.repository.js";
import { createCrmModule } from "./modules/crm/crm.module.js";
import { supplierInvoiceImportRoutes } from "./routes/supplierInvoiceImportRoutes.js";
import { analyticsRoutes } from "./routes/analyticsRoutes.js";
import { crmRoutes } from "./routes/crmRoutes.js";
import { runDailyVendusConsumptionJob } from "./services/dailyVendusConsumptionJobService.js";
import { UNATTENDED_SCOPE } from "./infra/scoped-db/unattended-scope.js";
import { createScopedQuery } from "./infra/scoped-db/scoped-query.js";
import { listOrganizations } from "./infra/scoped-db/organization-listing.js";
import { resolveClosingEnterpriseId } from "./modules/air-menu/domain/services/resolve-closing-enterprise-id.js";
import { populateAuth, requireAuth, restrictEmployeeToPortalRoutes } from "./middleware/auth.js";
import { createAccessModule } from "./modules/access/access.module.js";
import { authRoutes } from "./routes/authRoutes.js";
import { createLocationsModule } from "./modules/locations/locations.module.js";
import { createOrganizationModule } from "./modules/organization/organization.module.js";
import { createDocumentsModule } from "./modules/documents/documents.module.js";
import { createCalendarModule } from "./modules/calendar/calendar.module.js";
import { createLocationCredentialsModule } from "./modules/location-credentials/location-credentials.module.js";
import { createSalesSummaryModule } from "./modules/sales-summary/sales-summary.module.js";
import { createHrModule } from "./modules/hr/hr.module.js";
import { createAccountingModule } from "./modules/accounting/accounting.module.js";
import { createStockPurchaseReviewModule } from "./modules/stock-purchase-review/stock-purchase-review.module.js";
import type {
  RecordInvoiceFinalizedForStockPort,
  GetStockPurchaseReviewStatusPort,
  DeleteDraftStockPurchaseReviewPort,
} from "./modules/stock-purchase-review/domain/ports/in/stock-purchase-review.ports.js";
import { createStockCountModule } from "./modules/stock-count/stock-count.module.js";
import { createStockPlanningModule } from "./modules/stock-planning/stock-planning.module.js";
import { createSalesDeclarationModule } from "./modules/sales-declaration/sales-declaration.module.js";
import { correlationId } from "./infra/http/correlation.js";
import { createSettingsModule } from "./modules/settings/settings.module.js";
import { createAuditModule } from "./modules/audit/audit.module.js";
import { createOrgStructureModule } from "./modules/org-structure/org-structure.module.js";
import { createNotificationsModule } from "./modules/notifications/notifications.module.js";
import { createPeopleModule } from "./modules/people/people.module.js";
import { createTimeBaseModule } from "./modules/time-base/time-base.module.js";
import { createAttendanceModule } from "./modules/attendance/attendance.module.js";
import { createAbsencesModule } from "./modules/absences/absences.module.js";
import { createTimeBankModule } from "./modules/time-bank/time-bank.module.js";
import { createRostersModule } from "./modules/rosters/rosters.module.js";
import { createPeriodsModule } from "./modules/periods/periods.module.js";
import { createDemoOrgModule } from "./modules/demo-data/demo-data.module.js";
import type { PeriodsContextPort } from "./modules/periods/domain/ports/out/periods.ports.js";
import { createAnnouncementsModule } from "./modules/announcements/announcements.module.js";
import { createAlertsModule } from "./modules/alerts/alerts.module.js";
import type { AlertsContextPort } from "./modules/alerts/domain/ports/out/alerts.ports.js";
import { createWorkspaceModule } from "./modules/workspace/workspace.module.js";
import { createReportsModule } from "./modules/reports/reports.module.js";
import type { ReportRow } from "./modules/reports/domain/entities/report.js";
import { SupabaseAbsencesDirectory } from "./modules/absences/adapters/out/supabase-absences-directory.js";
import type { OrganizationId } from "./kernel/organization-id.js";
import { SupabaseEmployeeSegments, SupabaseSettingsImpact } from "./modules/settings/adapters/out/supabase-settings.adapters.js";
import { SupabasePeopleRepository } from "./modules/people/adapters/out/supabase-people.repository.js";
import { portugueseNationalHolidays } from "./modules/calendar/domain/services/portuguese-holidays.service.js";
import { OrganizationTimezoneClock } from "./modules/settings/adapters/out/supabase-settings.adapters.js";
import { can } from "./modules/access/domain/services/effective-access.service.js";
import { problemHandler } from "./infra/http/problem-details.js";

const app = express();
// Render põe um proxy à frente: req.ip passa a ser o IP real do cliente (auditoria, ADR-0022).
app.set("trust proxy", 1);

// CORS: permitir frontend Vercel (produção + previews *.vercel.app) e localhost
const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    const allowed =
      !origin ||
      origin === "http://localhost:5173" ||
      origin === "http://localhost:3000" ||
      /\.vercel\.app$/.test(origin) ||
      ENV.CORS_EXTRA_ORIGINS.includes(origin);
    cb(null, allowed);
  },
  // ETag e ID de correlação legíveis pelo frontend (ADR-0022).
  exposedHeaders: ["ETag", "X-Correlation-Id", "Idempotent-Replayed", "X-Novo-RH-Mode"],
};
app.use(cors(corsOptions));
app.use(express.json());
// ID de correlação em todos os pedidos (ADR-0022) — devolvido em X-Correlation-Id.
app.use(correlationId);

// `commit` (fornecido pelo Render) confirma qual versão está no ar depois de um deploy.
app.get("/api/health", (_req, res) => res.json({ ok: true, commit: (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7) || null }));

// populateAuth runs for ALL routes (populates req.auth from Bearer token if present)
app.use(populateAuth);

// Kiosk routes registered BEFORE global requireAuth:
// GET /kiosk/daily-token and POST /kiosk/scan are public
// PATCH /employees/:id/kiosk-pin has inline requireAuth inside the handler
app.use("/api/hr", hrKioskRoutes);

// Vendus: credenciais e config (register ID, price groups, payment IDs)
// resolvidas da BD no boot (ticket 03, org-integration-credentials) —
// substitui VENDUS_API_KEY, VENDUS_REGISTER_ID/UBER_EATS_VENDUS_REGISTER_ID
// e os quatro env vars de price-group/payment-ID. Falha alto (throw) se o
// UNATTENDED_SCOPE não tiver estas linhas seedadas na BD — ver
// src/jobs/runVendusCredentialsCutover.ts.
const vendusBootConfig = await resolveVendusBootConfig(
  UNATTENDED_SCOPE.organizationId,
  UNATTENDED_SCOPE.locationId,
);
setVendusApiKey(vendusBootConfig.apiKey);

// Vendus: instanciado antes do cash-closings para injectar o gateway de sessões
const vendusModule = createVendusModule({
  eatzPaymentId: vendusBootConfig.eatzPaymentId,
  appsPaymentId: vendusBootConfig.appsPaymentId,
  salaoPriceGroupId: vendusBootConfig.salaoPriceGroupId,
  eatzPriceGroupId: vendusBootConfig.eatzPriceGroupId,
  concurrency: ENV.CONCURRENCY,
  historyStartYear: ENV.ANALYTICS_HISTORY_START_YEAR,
});

// Air Menu: credenciais e config resolvidas da base de dados (spec
// org-integration-credentials, ticket 04) — nunca de ENV.AIRMENU_API_KEY/
// USERNAME/PASSWORD/CLOSING_ENTERPRISE_ID, que deixaram de existir.
const airMenuCredentialsRepository = new SupabaseAirMenuCredentialsRepository(createScopedQuery);
const airMenuLocationConfigRepository = new SupabaseAirMenuLocationConfigRepository(createScopedQuery);

const airMenuCredentialsResult = await airMenuCredentialsRepository.getByOrganization(
  UNATTENDED_SCOPE.organizationId,
);
if (airMenuCredentialsResult.status === "not_configured") {
  throw new Error("AirMenu credentials not configured for the Angrybox organization — run the cutover script.");
}
const airMenuLocationConfigResult = await airMenuLocationConfigRepository.getByLocation(
  UNATTENDED_SCOPE.organizationId,
  UNATTENDED_SCOPE.locationId,
);
const airMenuClosingEnterpriseId = resolveClosingEnterpriseId(airMenuLocationConfigResult);

// Air Menu: instanciado antes do cash-closings para injectar getSummary
const airMenuModule = createAirMenuModule({
  apiKey: airMenuCredentialsResult.credentials.apiKey,
  username: airMenuCredentialsResult.credentials.username,
  password: airMenuCredentialsResult.credentials.password,
  enterprises: [{ id: ENV.AIRMENU_ENTERPRISE_ID, name: "Angry Box - Menu" }],
  webhookSecret: ENV.AIRMENU_WEBHOOK_SECRET,
});

// Air Menu public routes (webhook receiver + SSE stream) — no auth required
app.use("/api", airMenuModule.publicRouter);

// Cash closing module (hexagonal) — recebe gateway Vendus e getSummary do air-menu
const cashClosingsModule = createCashClosingsModule(
  vendusModule.gateway,
  vendusBootConfig.registerId,
  airMenuModule.getSummary,
  airMenuClosingEnterpriseId,
);

// Cash closing public routes (PIN verify + submit) — no auth required
app.use("/api", cashClosingsModule.publicRouter);

// KDS — public (kitchen screen, no login needed)
// Recebe o eventBus do air-menu para emitir pedidos AirMenu via SSE em tempo real
const kdsModule = createKdsModule({ eventBus: airMenuModule.eventBus });
app.use("/api", kdsModule.router);

// Location credentials module (hexagonal) — deviceRouter has no user auth:
// redeem is fully public (unpaired screen, no credential yet), tokens/me is
// gated per-route by requireDeviceAuth (a paired screen's own token, not a
// user session); adminRouter has its own requireAuth + requireMinRole("admin")
// applied per-route inside the controller
const locationCredentialsModule = createLocationCredentialsModule();
app.use("/api", locationCredentialsModule.deviceRouter);

// Financial base + invoices + locations + stock-purchase-review modules
// instantiated here (ahead of their protected route registration below) so
// processDirectDebits/reprocessMissingStockReviews are available for the
// internal cron router, which must be mounted before requireAuth.
//
// `invoices` → `stock-purchase-review` (gancho fire-and-forget de
// finalização de fatura, mais os dois ganchos síncronos do guard de edição
// de fatura — estado da revisão + hard-delete de rascunho, mesma direção)
// e `stock-purchase-review` → `invoices` (D10, leitura, para revalidação e
// para a varredura de recuperação) formam um ciclo de construção: nenhum
// dos dois pode ser construído primeiro na forma direta. Resolvido com um
// indirection object — `invoicesModule` é construído já com três ports
// funcionais que delegam para `*Ref.current`, só atribuídos aos use cases
// reais depois de `stockPurchaseReviewModule` existir.
const financialBaseModule = createFinancialBaseModule();
const locationsModule = createLocationsModule();
const recordInvoiceFinalizedForStockRef: { current: RecordInvoiceFinalizedForStockPort } = {
  current: { execute: async () => {} },
};
const recordInvoiceFinalizedForStockProxy: RecordInvoiceFinalizedForStockPort = {
  execute: (command) => recordInvoiceFinalizedForStockRef.current.execute(command),
};
const getStockPurchaseReviewStatusRef: { current: GetStockPurchaseReviewStatusPort } = {
  current: { execute: async () => null },
};
const getStockPurchaseReviewStatusProxy: GetStockPurchaseReviewStatusPort = {
  execute: (command) => getStockPurchaseReviewStatusRef.current.execute(command),
};
const deleteDraftStockPurchaseReviewRef: { current: DeleteDraftStockPurchaseReviewPort } = {
  current: { execute: async () => ({ deleted: false }) },
};
const deleteDraftStockPurchaseReviewProxy: DeleteDraftStockPurchaseReviewPort = {
  execute: (command) => deleteDraftStockPurchaseReviewRef.current.execute(command),
};
const invoicesModule = createInvoicesModule(
  financialBaseModule.createSupplier,
  recordInvoiceFinalizedForStockProxy,
  getStockPurchaseReviewStatusProxy,
  deleteDraftStockPurchaseReviewProxy,
);
const stockPurchaseReviewModule = createStockPurchaseReviewModule(
  invoicesModule.getInvoice,
  invoicesModule.listInvoices,
  financialBaseModule.listCostCenterCategories,
  financialBaseModule.getSupplier,
  locationsModule.listLocations,
);
recordInvoiceFinalizedForStockRef.current = stockPurchaseReviewModule.recordInvoiceFinalizedForStock;
getStockPurchaseReviewStatusRef.current = stockPurchaseReviewModule.getStockPurchaseReviewStatus;
deleteDraftStockPurchaseReviewRef.current = stockPurchaseReviewModule.deleteDraftStockPurchaseReview;

// Stock planning module (hexagonal) — "Planeamento de Stock" (Stock
// Intelligence 3.0). Instanciado aqui (antes do cron interno) para expor
// runDailyForecast/detectForecastDeviation ao cron — só lê financial-base
// (D10: getSupplier/listSupplierDeliverySchedules) e locations (D10,
// listLocations); sem dependência das instâncias de
// stockPurchaseReviewModule/stockCountModule (lê as suas tabelas
// partilhadas diretamente via ScopedQuery, ver README do módulo), por isso
// não entra no ciclo de construção acima.
const stockPlanningModule = createStockPlanningModule(
  locationsModule.listLocations,
  financialBaseModule.getSupplier,
  financialBaseModule.listSupplierDeliverySchedules,
);

// RH (hexagonal) — construído aqui, antes do cron interno, para expor a
// geração diária das automatizações de turnos (RH 2.0). As rotas continuam
// montadas mais abaixo, depois do requireAuth.
const hrModule = createHrModule();

// Internal cron routes: authenticated via requireCronSecret (Bearer
// CRON_SECRET), not user sessions — must be mounted before the global
// requireAuth below, or Supabase JWT auth rejects the request first.
if (ENV.CRON_SECRET) {
  app.use(
    "/api",
    createInternalCronRouter({
      processDirectDebits: invoicesModule.processDirectDebits,
      reprocessMissingStockReviews: stockPurchaseReviewModule.reprocessMissingStockReviews,
      runDailyForecast: stockPlanningModule.runDailyForecast,
      detectForecastDeviation: stockPlanningModule.detectForecastDeviation,
      generateAllShiftAutomations: hrModule.generateAllAutomations,
      listOrganizations,
    }),
  );
}

// All routes below this line require authentication
app.use(requireAuth);

// Utilizadores & Perfis de Acesso 2.0: acesso efetivo (perfil + exceções +
// estado) lido da BD por pedido — conta desativada é recusada já aqui.
// Novo RH: auditoria transversal e estrutura criadas antes dos acessos (que as usam);
// os routers montam-se mais abaixo, depois da autenticação.
const auditModule = createAuditModule();
const orgStructureModule = createOrgStructureModule({ audit: auditModule.recorder });
const accessModule = createAccessModule({
  mfa: ENV.MFA_ENFORCEMENT,
  orgUnits: (org, employeeId, date) => orgStructureModule.structure.unitsOf(org, employeeId, date),
  transversalAudit: auditModule.recorder,
});
// Âmbito (RE-34) dos endpoints do Novo RH que recebem um colaborador.
const canSeeEmployee = (req: express.Request, employeeId: string, date: string) =>
  accessModule.governance.canManageEmployee(
    req.auth!.orgId,
    { userId: req.auth!.sub, isAdmin: !!req.access?.isAdmin, profileId: req.access?.profile.id ?? null },
    employeeId,
    /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10),
  );
orgStructureModule.setScopeCheck(canSeeEmployee);
app.use(accessModule.guards.loadAccess);

// Portal do Colaborador: o papel `employee` só chega a `/api/me/*` — barreira
// por omissão, antes de qualquer rota de gestão (inclui as "qualquer role").
app.use(restrictEmployeeToPortalRoutes);
// Tabela central rota → permissão (Utilizadores & Perfis 2.0): substitui os
// antigos requireMinRole("manager") no mount, que se aplicavam a TODO o /api.
app.use(accessModule.guards.routeGuard);
// Novo RH (TK-3): perfis de gestão sem MFA (aal2) não passam nas rotas abrangidas por MFA_ENFORCEMENT.
app.use(accessModule.guards.requireMfa);
// Novo RH → modo Demonstração (ADR-0034): com `X-Novo-RH-Mode: demo`, um Admin age em
// /api/novo-rh/* na organização fictícia ligada à sua. Depois dos guardas, antes dos routers.
const demoOrgModule = createDemoOrgModule({
  support: {
    today: (org) => new OrganizationTimezoneClock(createScopedQuery).today(org),
    audit: (org, e) =>
      auditModule.recorder.record(org, { actor: e.actor, action: e.action, resourceType: "organization", resourceId: e.resourceId, before: null, after: e.after, reason: null }),
  },
  ptHolidays: (year) => portugueseNationalHolidays(year).map((h) => ({ date: h.date, name: h.name })),
});
app.use(demoOrgModule.demoContext);
app.use("/api", demoOrgModule.router);
// Rotas do Portal (/api/me/*) logo aqui: as montagens seguintes com
// requireMinRole(...) no próprio mount correm para todo o /api e recusariam
// o colaborador antes de chegar a elas.
app.use("/api", hrModule.meRouter);
app.use("/api", accessModule.meRouter);
app.use("/api", accessModule.governanceRouter);
app.use("/api", accessModule.adminRouter);

// Admin-only: user management
app.use("/api/auth", accessModule.guards.requireAdmin, authRoutes);

// Locations module (hexagonal) — org-scoped read, any authenticated role (D15)
app.use("/api", locationsModule.router);

// Organization module (hexagonal, Base Organizacional — Empresa): GET qualquer
// role autenticado; PATCH/logo/histórico com requireMinRole("admin") inline.
const organizationModule = createOrganizationModule();
app.use("/api", organizationModule.router);

// Documents module (hexagonal, Base Organizacional — motor único de documentos):
// categorias (GET qualquer role autenticado; escrita manager) e documentos da
// Empresa (manager+, inline). Montado antes do `hr`, que deixou de expor as
// categorias diretamente.
const documentsModule = createDocumentsModule();
app.use("/api", documentsModule.router);

// Calendar module (hexagonal, Base Organizacional — Calendário & Eventos):
// feriados (admin), eventos (manager) e prazos dos documentos da Empresa.
// Leitura para qualquer role autenticado, com visibilidade aplicada.
const calendarModule = createCalendarModule(locationsModule.listLocations, documentsModule.listCompanyDocuments);
app.use("/api", calendarModule.router);

// Location credentials admin routes (generate pairing code, list/revoke tokens)
app.use("/api", locationCredentialsModule.adminRouter);

// Manager+: financial, stock, documents, reports, pizza, preparations, analytics
app.use("/api", analyticsRoutes);
app.use("/api", documentsRoutes);
app.use("/api", reportsRoutes);
app.use("/api", dreRoutes);
app.use("/api", stockRoutes);
app.use("/api", supplierInvoiceImportRoutes);
app.use("/api", pizzaRoutes);
app.use("/api", preparationRoutes);

// HR routes: GETs allow hr_viewer; write handlers have inline requireMinRole("manager")
app.use("/api/hr", hrRoutes);
app.use("/api/hr", hrAuditRoutes);
app.use("/api/hr", hrLeaveRoutes);

// RH-02 (hexagonal) — superfície nova /api/hr/people, coexiste com o legacy
// acima (mesmas tabelas hr_employees/hr_employee_documents); GETs allow
// hr_viewer, writes têm requireMinRole("manager") inline no controller.
// RH-01 (Visão Geral) — /api/hr/overview*, só leitura, mesmo módulo.
app.use("/api", hrModule.router);

// Novo RH (task faseada) — auditoria transversal (Fase 1, ticket 03) e motor de
// configurações (ticket 02) e estrutura (ticket 04). Rotas em /api/novo-rh/{audit,structure,settings}.
app.use("/api", auditModule.router);
app.use("/api", orgStructureModule.router);
// Notificações na aplicação (Fase 1, ticket 10) — /api/me/notifications.
const notificationsModule = createNotificationsModule();
app.use("/api", notificationsModule.router);
// Novo RH → Pessoas (Fase 2): ficha, contratos, responsáveis, remuneração, campos, CSV.
const peopleModule = createPeopleModule({
  audit: auditModule.recorder,
  accounts: { disableLinkedUser: (org, userId, actor) => accessModule.governance.disableLinkedUser(org, userId, actor) },
  clock: new OrganizationTimezoneClock(createScopedQuery),
  viewerOf: async (req) => {
    const org = req.auth!.orgId;
    const access = req.access!;
    const who = { userId: req.auth!.sub, isAdmin: access.isAdmin, profileId: access.profile.id };
    const [canSee, field] = await Promise.all([
      accessModule.governance.scopeChecker(org, who),
      accessModule.governance.fieldAccessFor(org, who.profileId, who.isAdmin),
    ]);
    return {
      actor: req.auth!.email || req.auth!.sub,
      isAdmin: access.isAdmin,
      canExport: can(access, "hr.people_export", "MANAGE"),
      canSensitive: can(access, "hr.sensitive_data", "MANAGE"),
      field,
      canSee,
    };
  },
});
app.use("/api", peopleModule.router);
const settingsModule = createSettingsModule({
  canRetroactive: (req) => !!req.access && can(req.access, "governance.settings_retroactive", "MANAGE"),
  audit: auditModule.recorder,
  units: orgStructureModule.structure,
  canSeeEmployee,
  notifier: {
    async retroactiveChange(org, info) {
      await notificationsModule.notifications.notify(org, {
        recipientUserIds: await notificationsModule.notifications.adminUserIds(org),
        kind: "settings.retroactive_change",
        title: `Alteração retroativa: ${info.label}`,
        body: `${info.actor} alterou "${info.label}" (${info.profileName}) com efeito desde ${info.validFrom}: ${info.employees} colaborador(es), ${info.pastDays} dia(s) passados.`,
        link: "/hr/novo/configuracoes",
        dedupeKey: `settings:${info.valueId}`,
      });
    },
  },
});
app.use("/api", settingsModule.router);

// Novo RH → Tempo (Fase 3): horários, calendários, atribuições, teórico diário.
const segments = new SupabaseEmployeeSegments(createScopedQuery, orgStructureModule.structure);
const peopleRepo = new SupabasePeopleRepository(createScopedQuery);
const targetsImpact = new SupabaseSettingsImpact(createScopedQuery, orgStructureModule.structure);
const timeBaseModule = createTimeBaseModule({
  context: {
    unitsAt: (org, employeeId, date) => segments.segmentsOf(org, employeeId, date),
    contractWeeklyMinutesAt: async (org, employeeId, date) => {
      const c = (await peopleRepo.listContracts(org, employeeId)).find((x) => x.status === "active" && x.startDate <= date && (x.endDate === null || date <= x.endDate));
      return c?.weeklyHours ? Math.round(c.weeklyHours * 60) : null;
    },
    theoreticalModeAt: async (org, employeeId, date) => {
      const s = (await settingsModule.settings.effectiveFor(org, employeeId, date, "time_tracking")).find((x) => x.key === "time_tracking.theoretical.mode");
      return s?.value === "contract" ? "contract" : "schedule";
    },
  },
  impact: { countEmployees: (org, targets, date) => targetsImpact.countEmployees(org, { targets }, date) },
  national: { forCountry: (country, year) => (country === "PT" ? portugueseNationalHolidays(year) : null) },
  audit: auditModule.recorder,
  clock: new OrganizationTimezoneClock(createScopedQuery),
  canSeeEmployee,
});
app.use("/api", timeBaseModule.router);

// Novo RH → Escalas (Fase 7): modelos, escalas com versões publicadas, restrições, trocas.
const absencesDirectory = new SupabaseAbsencesDirectory(createScopedQuery);
// TK-17: guarda partilhada — datas de períodos fechados (módulo periods, ligado mais abaixo).
const periodGuard = { closedDates: (org: OrganizationId, employeeId: string, from: string, to: string) => periodsModule.periods.closedDates(org, employeeId, from, to) };
const rostersModule = createRostersModule({
  effectiveSettings: async (org, employeeId, date) => {
    const [tt, legal] = await Promise.all([
      settingsModule.settings.effectiveFor(org, employeeId, date, "time_tracking"),
      settingsModule.settings.effectiveFor(org, employeeId, date, "legal"),
    ]);
    return [...tt, ...legal];
  },
  approvedAbsenceDates: async (org, employeeId, from, to) => {
    const approved = await absencesModule.absences.listRequests(org, { employeeId, status: "approved", from, to }, true, "sistema");
    const dates: string[] = [];
    for (const r of approved.filter((x) => x.kind === "absence")) {
      for (let d = new Date(`${r.startDate}T00:00:00Z`); d.toISOString().slice(0, 10) <= r.endDate; d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  },
  employeeForUser: (org, userId) => absencesDirectory.employeeForUser(org, userId),
  userOfEmployee: (org, employeeId) => absencesDirectory.userOfEmployee(org, employeeId),
  notifier: {
    notify: async (org, userIds, n) => {
      if (!userIds.length) return;
      await notificationsModule.notifications.notify(org, { recipientUserIds: userIds, kind: "rosters.change", title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey });
    },
  },
  // Cada publicação pede o recálculo da assiduidade dos dias afetados (o teórico mudou).
  published: {
    published: (org, changes) => {
      const byEmployee = new Map<string, string[]>();
      for (const c of changes) byEmployee.set(c.employeeId, [...(byEmployee.get(c.employeeId) ?? []), c.workDate]);
      for (const [employeeId, dates] of byEmployee) {
        dates.sort();
        void attendanceModule.attendance.requestRecalculation(org, { userId: "sistema", email: "sistema" }, employeeId, dates[0]!, dates.at(-1)!).catch(() => undefined);
      }
    },
  },
  audit: auditModule.recorder,
  canSeeEmployee,
  periods: periodGuard,
});
app.use("/api", rostersModule.router);

/** Teórico do dia: turno publicado da escala, senão o horário (Fase 3); feriado confirmado prevalece (ADR-0030). */
async function plannedDays(org: OrganizationId, employeeId: string, from: string, to: string) {
  const [{ days }, roster] = await Promise.all([timeBaseModule.time.theoretical(org, employeeId, from, to), rostersModule.rosters.plannedFor(org, employeeId, from, to)]);
  return days.map((d) => {
    const r = roster.get(d.date);
    if (!r || d.reason === "holiday") return d;
    const segs = r.segments;
    return {
      ...d,
      minutes: r.minutes,
      reason: r.dayOff ? ("rest_day" as const) : ("schedule" as const),
      plannedStart: segs[0]?.start ?? null,
      plannedEnd: segs.at(-1)?.end ?? null,
      plannedRanges: segs,
      night: r.night,
    };
  });
}

// Novo RH → Assiduidade (Fase 4): marcações, motor de apuramento, revisões, incidentes.
const attendanceModule = createAttendanceModule({
  effectiveSettings: async (org, employeeId, date) => {
    const [tt, legal] = await Promise.all([
      settingsModule.settings.effectiveFor(org, employeeId, date, "time_tracking"),
      settingsModule.settings.effectiveFor(org, employeeId, date, "legal"),
    ]);
    return [...tt, ...legal];
  },
  // Plano diário = teórico do time-base − ausências aprovadas (CF-7, Fase 5).
  plans: async (org, employeeId, from, to) => {
    const days = await plannedDays(org, employeeId, from, to);
    const effects = await absencesModule.absences.dayEffects(org, employeeId, from, to, new Map(days.map((d) => [d.date, d.minutes])));
    return new Map(
      days.map((d) => {
        const fx = effects.get(d.date);
        return [
          d.date,
          {
            theoreticalMinutes: Math.max(0, d.minutes - (fx?.reduceMinutes ?? 0)),
            plannedStart: d.plannedStart,
            plannedEnd: d.plannedEnd,
            nightSchedule: d.night,
            excused: d.reason === "holiday" || !!fx?.excused,
            creditSeconds: (fx?.creditMinutes ?? 0) * 60,
          },
        ];
      }),
    );
  },
  audit: auditModule.recorder,
  canSeeEmployee,
  periods: periodGuard,
});
app.use("/api", attendanceModule.meRouter);
app.use("/api", attendanceModule.adminRouter);

// Novo RH → Ausências (Fase 5): tipos, pedidos, aprovações multinível, saldos em ledger.
const absencesModule = createAbsencesModule({
  contracts: (org, employeeId) => peopleRepo.listContracts(org, employeeId),
  managers: (org, employeeId) => peopleRepo.listManagers(org, employeeId),
  planDays: async (org, employeeId, from, to) =>
    (await plannedDays(org, employeeId, from, to)).map((d) => ({ date: d.date, minutes: d.minutes, plannedRanges: d.plannedRanges })),
  vacationRulesFor: async (org, employeeId, date) => {
    const a = (await timeBaseModule.time.assignmentsFor(org, employeeId, date)).vacationCalendar;
    return a ? ((await timeBaseModule.time.listVacationCalendars(org)).find((c) => c.id === a.resourceId) ?? null) : null;
  },
  holidayOn: async (org, employeeId, date) => {
    const a = (await timeBaseModule.time.assignmentsFor(org, employeeId, date)).holidayCalendar;
    const cal = a ? (await timeBaseModule.time.listHolidayCalendars(org)).find((c) => c.id === a.resourceId) : undefined;
    const day = cal?.days.find((d) => d.date === date && d.status === "confirmed");
    return cal && day ? { name: day.name, coefficient: day.coefficient ?? cal.compensationCoefficient, approvalRequired: cal.approvalRequired } : null;
  },
  workedSeconds: async (org, employeeId, date) => (await attendanceModule.attendance.days(org, employeeId, date, date)).days[0]?.workedSeconds ?? 0,
  adminUserIds: (org) => notificationsModule.notifications.adminUserIds(org),
  today: (org) => new OrganizationTimezoneClock(createScopedQuery).today(org),
  notifier: {
    notify: async (org, userIds, n) => {
      if (!userIds.length) return;
      await notificationsModule.notifications.notify(org, { recipientUserIds: userIds, kind: "absences.request", title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey });
    },
  },
  audit: auditModule.recorder,
  canSeeEmployee,
  canPrivate: (req) => !!req.access && can(req.access, "hr.absences_private", "MANAGE"),
  periods: periodGuard,
});
app.use("/api", absencesModule.meRouter);
app.use("/api", absencesModule.adminRouter);

// Novo RH → Banco de horas (Fase 6): ledger append-only sobre os dias apurados.
const timeBankModule = createTimeBankModule({
  attendanceDays: async (org, employeeId, from, to) => {
    const r = await attendanceModule.attendance.days(org, employeeId, from, to);
    return { timeZone: r.timeZone, days: r.days };
  },
  effectiveSettings: (org, employeeId, date) => settingsModule.settings.effectiveFor(org, employeeId, date, "time_tracking"),
  holidayOn: async (org, employeeId, date) => {
    const a = (await timeBaseModule.time.assignmentsFor(org, employeeId, date)).holidayCalendar;
    const cal = a ? (await timeBaseModule.time.listHolidayCalendars(org)).find((c) => c.id === a.resourceId) : undefined;
    const day = cal?.days.find((d) => d.date === date && d.status === "confirmed");
    return cal && day ? { coefficient: day.coefficient ?? cal.compensationCoefficient } : null;
  },
  employeeForUser: (org, userId) => absencesModule.absences.myEmployeeId(org, { userId, email: "" }).catch(() => null),
  today: (org) => new OrganizationTimezoneClock(createScopedQuery).today(org),
  audit: auditModule.recorder,
  canSeeEmployee,
  periods: periodGuard,
});
app.use("/api", timeBankModule.router);

// Novo RH → Períodos (Fase 8): fecho com fotografia, reabertura com dupla aprovação, exportações.
const periodsModule = createPeriodsModule({
  context: {
    employeesInScope: async (org, p) => {
      const list = await peopleRepo.list(org, { status: "all", ...(p.scopeType === "location" && p.scopeId ? { locationId: p.scopeId } : {}) });
      const out: string[] = [];
      for (const e of list) {
        if (e.status === "active") {
          out.push(e.id);
          continue;
        }
        // Quem saiu entra se tinha contrato em parte do período.
        const contracts = await peopleRepo.listContracts(org, e.id);
        if (contracts.some((c) => c.status === "active" && c.startDate <= p.endDate && (c.endDate === null || c.endDate >= p.startDate))) out.push(e.id);
      }
      return out;
    },
    employeeLocations: async (org, employeeId, date) => (await segments.segmentsOf(org, employeeId, date)).locationIds,
    pendingItems: async (org, employeeIds, from, to) => {
      const items: Awaited<ReturnType<PeriodsContextPort["pendingItems"]>> = [];
      for (const e of employeeIds) {
        for (const i of await attendanceModule.attendance.listIncidents(org, { status: "open", employeeId: e, from, to })) {
          items.push({ type: "incident", id: i.id, employeeId: e, date: i.workDate, label: `Incidente: ${i.type}` });
        }
        for (const c of await attendanceModule.attendance.listCorrections(org, { status: "pending", employeeId: e })) {
          const d = (c.occurredAt ?? c.createdAt).slice(0, 10);
          if (d >= from && d <= to) items.push({ type: "correction_request", id: c.id, employeeId: e, date: d, label: "Pedido de correção pendente" });
        }
        for (const r of await absencesModule.absences.listRequests(org, { status: "pending", employeeId: e, from, to }, true, "sistema")) {
          items.push({ type: "absence_request", id: r.id, employeeId: e, date: r.startDate, label: `Ausência pendente: ${r.typeName}` });
        }
        for (const v of await timeBankModule.timeBank.pendingValidations(org, e)) {
          if (v.workDate >= from && v.workDate <= to) items.push({ type: "excess_validation", id: `${e}:${v.workDate}`, employeeId: e, date: v.workDate, label: "Excedente por validar" });
        }
      }
      return items;
    },
    prepare: async (org, employeeId, from, to) => {
      for (let s = from; s <= to; ) {
        const end = new Date(`${s}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 30);
        const e = end.toISOString().slice(0, 10) < to ? end.toISOString().slice(0, 10) : to;
        await attendanceModule.attendance.recalculate(org, employeeId, s, e, "Fecho de período");
        end.setUTCDate(end.getUTCDate() + 1);
        s = end.toISOString().slice(0, 10);
      }
      await timeBankModule.timeBank.sync(org, employeeId, "sistema", { from, to });
    },
    totals: async (org, employeeId, from, to) => {
      const [days, entries, absences] = await Promise.all([
        attendanceModule.attendance.storedDays(org, employeeId, from, to),
        timeBankModule.timeBank.entriesBetween(org, employeeId, from, to),
        absencesModule.absences.listRequests(org, { status: "approved", employeeId, from, to }, true, "sistema"),
      ]);
      const types = await absencesModule.absences.listTypes(org);
      const sum = (f: "workedSeconds" | "theoreticalSeconds" | "excessSeconds" | "nightSeconds" | "pendingSeconds") => days.reduce((s, d) => s + d[f], 0);
      const byLocation = new Map<string | null, number>();
      for (const d of days) {
        const loc = (await segments.segmentsOf(org, employeeId, d.workDate)).locationIds[0] ?? null;
        byLocation.set(loc, (byLocation.get(loc) ?? 0) + d.workedSeconds);
      }
      const span = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
      return {
        employeeId,
        workedSeconds: sum("workedSeconds"),
        theoreticalSeconds: sum("theoreticalSeconds"),
        excessSeconds: sum("excessSeconds"),
        nightSeconds: sum("nightSeconds"),
        pendingSeconds: sum("pendingSeconds"),
        // Ausências que atravessam o período contam pela parte de dias dentro dele.
        absences: absences
          .filter((r) => r.kind === "absence")
          .map((r) => {
            const a = r.startDate > from ? r.startDate : from;
            const b = r.endDate < to ? r.endDate : to;
            const share = r.unit === "hours" ? 1 : span(a, b) / span(r.startDate, r.endDate);
            const t = types.find((x) => x.id === r.typeId);
            return { typeId: r.typeId, typeName: t?.name ?? r.typeName, code: t?.code ?? null, unit: r.unit, amount: Math.round(r.amount * share * 100) / 100 };
          }),
        bankSeconds: entries.reduce((s, e) => s + e.seconds, 0),
        bankPaidSeconds: -entries.filter((e) => e.kind === "compensation_paid").reduce((s, e) => s + e.seconds, 0),
        byLocation: [...byLocation].map(([locationId, workedSeconds]) => ({ locationId, workedSeconds })),
      };
    },
    employeeInfo: async (org, employeeIds) => {
      const out = [];
      for (const id of employeeIds) {
        const e = await peopleRepo.get(org, id);
        out.push({ employeeId: id, name: e?.fullName ?? "", nif: e?.nif ?? null });
      }
      return out;
    },
  },
  audit: auditModule.recorder,
  canSensitive: (req) => !!req.access && can(req.access, "hr.sensitive_data", "MANAGE"),
});
app.use("/api", periodsModule.router);

// Novo RH → Fase 9: comunicados, alertas, espaço de trabalho (tarefas, solicitações, quem está) e relatórios.
const inAppNotify = async (org: OrganizationId, userIds: string[], n: { title: string; body: string; link: string; dedupeKey: string }, kind: string) => {
  // D12 (ADR-0033): só na aplicação; e-mail/push/WhatsApp desligados até decisão.
  if (!userIds.length) return;
  await notificationsModule.notifications.notify(org, { recipientUserIds: [...new Set(userIds)], kind, title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey });
};
const novoRhAudit = (org: OrganizationId, e: { actor: string; action: string; resourceId: string; after: unknown; reason?: string | null }, resourceType: string) =>
  auditModule.recorder.record(org, { actor: e.actor, action: e.action, resourceType, resourceId: e.resourceId, before: null, after: e.after, reason: e.reason ?? null });
const todayUtc = () => new Date().toISOString().slice(0, 10);
const activeEmployees = (org: OrganizationId) => peopleRepo.list(org, { status: "active" });

const announcementsModule = createAnnouncementsModule({
  context: {
    resolveAudience: async (org, audience) => {
      const active = await activeEmployees(org);
      let ids: string[];
      if (audience.type === "all") ids = active.map((e) => e.id);
      else if (audience.type === "employees") ids = active.filter((e) => audience.ids.includes(e.id)).map((e) => e.id);
      else {
        ids = [];
        for (const e of active) {
          const units = await segments.segmentsOf(org, e.id, todayUtc());
          const mine = audience.type === "locations" ? units.locationIds : units.groupIds;
          if (mine.some((x) => audience.ids.includes(x))) ids.push(e.id);
        }
      }
      return Promise.all(ids.map(async (employeeId) => ({ employeeId, userId: await absencesDirectory.userOfEmployee(org, employeeId) })));
    },
    employeeForUser: (org, userId) => absencesDirectory.employeeForUser(org, userId),
    notify: (org, userIds, n) => inAppNotify(org, userIds, n, "announcements.new"),
    now: () => new Date().toISOString(),
    audit: (org, e) => novoRhAudit(org, e, "announcement"),
  },
});
app.use("/api", announcementsModule.router);

const workspaceModule = createWorkspaceModule({
  context: {
    employeeForUser: (org, userId) => absencesDirectory.employeeForUser(org, userId),
    employeeLocations: async (org, employeeId) => (await segments.segmentsOf(org, employeeId, todayUtc())).locationIds,
    presentNow: async (org) => {
      const rows = await attendanceModule.attendance.presentNow(org);
      return Promise.all(
        rows.map(async (r) => ({
          ...r,
          name: (await peopleRepo.get(org, r.employeeId))?.fullName ?? "",
          locationIds: (await segments.segmentsOf(org, r.employeeId, todayUtc())).locationIds,
        })),
      );
    },
    whosInScope: async (org, employeeId) => {
      const s = (await settingsModule.settings.effectiveFor(org, employeeId, todayUtc(), "security")).find((x) => x.key === "security.visibility.whos_in_scope");
      return s?.value === "organization" ? "organization" : "own_location";
    },
    now: () => new Date().toISOString(),
    notify: (org, userIds, n) => inAppNotify(org, userIds, n, "workspace.update"),
    userOfEmployee: (org, employeeId) => absencesDirectory.userOfEmployee(org, employeeId),
    audit: (org, e) => novoRhAudit(org, e, "workspace"),
  },
});
app.use("/api", workspaceModule.router);

const alertsModule = createAlertsModule({
  context: {
    candidates: async (org, kind) => {
      const out: Awaited<ReturnType<AlertsContextPort["candidates"]>> = [];
      if (kind === "pending_absence") {
        for (const r of await absencesModule.absences.listRequests(org, { status: "pending" }, false, "sistema")) {
          out.push({ sourceType: "absence_request", sourceId: r.id, employeeId: r.employeeId, title: `Ausência pendente: ${r.typeName} (${r.startDate})`, mode: "since", at: r.createdAt });
        }
      } else if (kind === "pending_correction") {
        for (const c of await attendanceModule.attendance.listCorrections(org, { status: "pending" })) {
          out.push({ sourceType: "correction_request", sourceId: c.id, employeeId: c.employeeId, title: "Pedido de correção de marcação pendente", mode: "since", at: c.createdAt });
        }
      } else if (kind === "pending_reopening") {
        for (const r of (await periodsModule.periods.listReopenings(org)).filter((x) => x.status === "pending")) {
          out.push({ sourceType: "period_reopening", sourceId: r.id, employeeId: null, title: `Reabertura de período pendente (${r.requestedBy})`, mode: "since", at: r.createdAt });
        }
      } else if (kind === "pending_swap") {
        for (const s of [...(await rostersModule.rosters.listSwaps(org, "pending_target")), ...(await rostersModule.rosters.listSwaps(org, "pending_manager"))]) {
          out.push({ sourceType: "roster_swap", sourceId: s.id, employeeId: s.requesterEmployeeId, title: "Troca de turno pendente", mode: "since", at: s.createdAt });
        }
      } else if (kind === "pending_custom_request") {
        for (const r of await workspaceModule.workspace.listRequests(org, "pending")) {
          out.push({ sourceType: "custom_request", sourceId: r.id, employeeId: r.employeeId, title: "Solicitação pendente", mode: "since", at: r.createdAt });
        }
      } else if (kind === "overdue_task") {
        for (const t of await workspaceModule.workspace.listTasks(org, "open")) {
          if (t.dueAt && t.dueAt < new Date().toISOString()) out.push({ sourceType: "ops_task", sourceId: t.id, employeeId: t.assigneeEmployeeId, title: `Tarefa em atraso: ${t.title}`, mode: "since", at: t.dueAt });
        }
      } else {
        // contract_end / probation_end: contratos ativos com fim (ou fim do período experimental) definido.
        for (const e of await activeEmployees(org)) {
          for (const c of await peopleRepo.listContracts(org, e.id)) {
            if (c.status !== "active") continue;
            const at = kind === "contract_end" ? c.endDate : c.probationEnd;
            if (at) out.push({ sourceType: kind === "contract_end" ? "contract" : "probation", sourceId: c.id, employeeId: e.id, title: `${kind === "contract_end" ? "Fim de contrato" : "Fim do período experimental"}: ${e.fullName} (${at})`, mode: "until", at });
          }
        }
      }
      return out;
    },
    resolveOwner: async (org, owner) => {
      if (owner === "admins") return notificationsModule.notifications.adminUserIds(org);
      if (owner.startsWith("profile:")) return absencesDirectory.profileUserIds(org, owner.slice(8));
      return owner.startsWith("user:") ? [owner.slice(5)] : [];
    },
    notify: (org, userIds, n) => inAppNotify(org, userIds, n, "alerts.alert"),
    now: () => new Date().toISOString(),
    audit: (org, e) => novoRhAudit(org, e, "alert"),
  },
});
app.use("/api", alertsModule.router);

const reportsModule = createReportsModule({
  sources: {
    rows: async (org, key, period) => {
      const rows: ReportRow[] = [];
      const h = (s: number) => Math.round((s / 3600) * 100) / 100;
      if (key === "change_history") {
        for (const ev of await auditModule.queries.list(org, { from: period!.from, to: period!.to, limit: 1000 })) {
          rows.push({ when: ev.occurredAt.slice(0, 16).replace("T", " "), actor: ev.actor, action: ev.action, resource: ev.resourceType, reason: ev.reason ?? "" });
        }
        return rows;
      }
      if (key === "absences") {
        for (const r of await absencesModule.absences.listRequests(org, { status: "approved", from: period!.from, to: period!.to }, false, "sistema")) {
          rows.push({ employeeId: r.employeeId, employee: (await peopleRepo.get(org, r.employeeId))?.fullName ?? "", type: r.typeName, start: r.startDate, end: r.endDate, amount: r.amount, unit: r.unit === "days" ? "dias" : "horas" });
        }
        return rows;
      }
      for (const e of await activeEmployees(org)) {
        if (key === "attendance") {
          const days = await attendanceModule.attendance.storedDays(org, e.id, period!.from, period!.to);
          const sum = (f: "workedSeconds" | "theoreticalSeconds" | "excessSeconds" | "nightSeconds" | "pendingSeconds") => days.reduce((s, d) => s + d[f], 0);
          const open = await attendanceModule.attendance.listIncidents(org, { status: "open", employeeId: e.id, from: period!.from, to: period!.to });
          rows.push({ employeeId: e.id, employee: e.fullName, worked: h(sum("workedSeconds")), theoretical: h(sum("theoreticalSeconds")), difference: h(sum("excessSeconds")), night: h(sum("nightSeconds")), pending: h(sum("pendingSeconds")), openIncidents: open.length });
        } else if (key === "balances") {
          for (const b of await absencesModule.absences.balances(org, e.id, null, false)) {
            rows.push({ employeeId: e.id, employee: e.fullName, type: b.typeName, unit: b.unit === "days" ? "dias" : "horas", accrued: b.accrued, used: b.used, pending: b.pending, available: b.available });
          }
          const bank = (await timeBankModule.timeBank.entriesBetween(org, e.id, "1900-01-01", "2999-12-31")).reduce((s, x) => s + x.seconds, 0);
          rows.push({ employeeId: e.id, employee: e.fullName, type: "Banco de horas", unit: "horas", accrued: "", used: "", pending: "", available: h(bank) });
        } else if (key === "incomplete_data") {
          const today = todayUtc();
          const missing: string[] = [];
          if (!e.nif) missing.push("NIF");
          const contracts = await peopleRepo.listContracts(org, e.id);
          if (!contracts.some((c) => c.status === "active" && c.startDate <= today && (c.endDate === null || c.endDate >= today))) missing.push("Contrato ativo");
          const hasSchedule = !!(await timeBaseModule.time.assignmentsFor(org, e.id, today)).schedule;
          const hasRoster = (await rostersModule.rosters.plannedFor(org, e.id, today, today)).size > 0;
          if (!hasSchedule && !hasRoster) missing.push("Horário ou escala");
          const managers = await peopleRepo.listManagers(org, e.id);
          if (!managers.some((m) => m.validFrom <= today && (m.validTo === null || m.validTo >= today))) missing.push("Responsável");
          if (!(await absencesDirectory.userOfEmployee(org, e.id))) missing.push("Conta do Portal");
          if (missing.length) rows.push({ employeeId: e.id, employee: e.fullName, missing: missing.join(", ") });
        }
      }
      return rows;
    },
  },
  access: {
    canSeeEmployee,
    canAudit: (req) => !!req.access && can(req.access, "governance.audit", "READ"),
  },
});
app.use("/api", reportsModule.router);

// CRM: acessível a managers+
const crmModule = createCrmModule();
app.use("/api", crmModule.router);
app.use("/api", crmRoutes);

// Financial base module (hexagonal) — instantiated above, before requireAuth
app.use("/api", financialBaseModule.router);

// Invoices module (hexagonal) — instantiated above, before requireAuth
app.use("/api", invoicesModule.router);

// Accounting module (hexagonal) — Fase 1 (Documentos agregados, despesas de
// sócio/plataforma, Controlo de IVA em acompanhamento). Cross-module reads
// (D10) de vendus/invoices/financial-base, nunca duplica os seus cálculos.
const accountingModule = createAccountingModule(
  vendusModule.getSummary,
  invoicesModule.listInvoices,
  invoicesModule.listInvoiceLines,
  financialBaseModule.listCostCenterCategories,
);
app.use("/api", accountingModule.router);

// Stock purchase review module (hexagonal) — "Compra por rever". Instanciado
// acima (antes do requireAuth) para expor recordInvoiceFinalizedForStock a
// `invoices` e reprocessMissingStockReviews ao cron interno.
app.use("/api", stockPurchaseReviewModule.router);

// Stock count module (hexagonal) — "Contagem Física de Stock 2.0". Sem
// dependência de invoices/financial-base/stock-purchase-review — só lê
// locations (D10, mesmo ListLocationsPort já usado por
// stock-purchase-review). requireMinRole("manager") no mount, com checks
// inline de admin dentro do controller para confirmar/forçar
// sobreposição/definir valor final manual (secção 64).
const stockCountModule = createStockCountModule(locationsModule.listLocations);
app.use("/api", stockCountModule.router);

// Stock planning module (hexagonal) — "Planeamento de Stock". Instanciado
// acima (antes do cron interno) para expor runDailyForecast/
// detectForecastDeviation; router só montado aqui.
app.use("/api", stockPlanningModule.router);

// Payable entries module (hexagonal)
const payableEntriesModule = createPayableEntriesModule();
app.use("/api", payableEntriesModule.router);

// Payable recurrences module (hexagonal)
const payableRecurrencesModule = createPayableRecurrencesModule();
app.use("/api", payableRecurrencesModule.router);

// Bank accounts module (hexagonal) — must be before bank-statements
const bankAccountsModule = createBankAccountsModule();
app.use("/api", bankAccountsModule.router);

// Bank statements module (hexagonal) — receives bank account read port for auto-linking
const bankStatementsModule = createBankStatementsModule(bankAccountsModule.accountRepo, financialBaseModule.listSuppliers);
app.use("/api", bankStatementsModule.router);

// Air Menu: rota protegida (módulo já instanciado acima)
app.use("/api", airMenuModule.router);

// Vendus (hexagonal) — router registado aqui; módulo instanciado acima (antes do cash-closings)
// As routes legadas (/api/analytics/*, /api/documents, /api/reports/monthly-summary)
// continuam registadas acima durante a migração do frontend.
app.use("/api", vendusModule.router);

// Sales Summary module (hexagonal) — requires vendus and air-menu getSummary ports
const salesSummaryModule = createSalesSummaryModule(
  vendusModule.getSummary,
  airMenuModule.getSummary,
  { salesSummaryEnterpriseId: ENV.AIRMENU_SALES_SUMMARY_ENTERPRISE_ID },
);
app.use("/api", salesSummaryModule.router);

// Sales Declaration (hexagonal) — Excel para o Mercado Bom Sucesso a partir dos SAF-T enviados
const salesDeclarationModule = createSalesDeclarationModule();
app.use("/api", salesDeclarationModule.router);

// Cash closing manager routes (authenticated)
app.use("/api", cashClosingsModule.managedRouter);

// Erros não tratados → RFC 7807 (application/problem+json), sem detalhes internos (ADR-0022).
app.use(problemHandler);

app.listen(ENV.PORT, () => {
  console.log(`Backend running on http://localhost:${ENV.PORT}`);
});

if (ENV.ENABLE_DAILY_CONSUMPTION_CRON) {
  void import("node-cron").then(({ default: cron }) => {
    cron.schedule(
      ENV.DAILY_CONSUMPTION_CRON_SCHEDULE,
      () => {
        void runDailyVendusConsumptionJob(UNATTENDED_SCOPE.organizationId, {
          locationId: UNATTENDED_SCOPE.locationId,
        })
          .then((r) => {
            console.log("[cron] daily-vendus-consumption ok", r);
          })
          .catch((e) => {
            console.error("[cron] daily-vendus-consumption failed", e);
          });
      },
      { timezone: "Europe/Lisbon" }
    );
    console.log(
      `[cron] daily-vendus-consumption scheduled: ${ENV.DAILY_CONSUMPTION_CRON_SCHEDULE} (Europe/Lisbon)`
    );
  });
}
