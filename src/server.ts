import { hashPin } from "./utils/kiosk.js";
import compression from "compression";
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
import { createFiscalDocumentsModule } from "./modules/fiscal-documents/fiscal-documents.module.js";
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
import { setStockImportFiscalDocuments } from "./services/supplierInvoiceImportService.js";
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
import type { SuggestStockRoutingPort } from "./modules/stock-purchase-review/domain/ports/in/suggest-stock-routing.port.js";
import { createStockPurchaseReviewModule } from "./modules/stock-purchase-review/stock-purchase-review.module.js";
import type {
  RecordInvoiceFinalizedForStockPort,
  GetStockPurchaseReviewStatusPort,
  DeleteDraftStockPurchaseReviewPort,
} from "./modules/stock-purchase-review/domain/ports/in/stock-purchase-review.ports.js";
import { createStockCountModule } from "./modules/stock-count/stock-count.module.js";
import { createRecipeCostingModule } from "./modules/recipe-costing/recipe-costing.module.js";
import { createStockPlanningModule } from "./modules/stock-planning/stock-planning.module.js";
import { createStockDemoModule } from "./modules/stock-demo/stock-demo.module.js";
import { setDemoProductsSource } from "./services/ingredientConsumptionService.js";
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
import { RosterBlockedError, RosterConflictError, RosterNotFoundError, RosterValidationError } from "./modules/rosters/domain/errors.js";
import { createAssistantModule } from "./modules/assistant/assistant.module.js";
import { AssistantError } from "./modules/assistant/domain/entities/assistant.js";
import { SchedulingBlockedError } from "./modules/assistant/domain/ports/out/assistant.ports.js";
import { SupabaseIdempotencyStore } from "./infra/http/supabase-idempotency.store.js";
import { createDashboardModule } from "./modules/dashboard/dashboard.module.js";
import { createGoogleReviewsModule } from "./modules/google-reviews/google-reviews.module.js";
import type { DashboardCachePort, DashboardMetric } from "./modules/dashboard/domain/ports/out/dashboard.ports.js";
import { createPeriodsModule } from "./modules/periods/periods.module.js";
import { createDemoOrgModule } from "./modules/demo-data/demo-data.module.js";
import { DEMO_AREAS, demoAreaIndex } from "./modules/demo-data/domain/services/demo-scenario.js";
import { createOverviewModule } from "./modules/overview/overview.module.js";
import { createInboxModule } from "./modules/inbox/inbox.module.js";
import { createRemindersModule } from "./modules/reminders/reminders.module.js";
import type { PeriodsContextPort } from "./modules/periods/domain/ports/out/periods.ports.js";
import { createAnnouncementsModule } from "./modules/announcements/announcements.module.js";
import { createAlertsModule } from "./modules/alerts/alerts.module.js";
import type { AlertsContextPort } from "./modules/alerts/domain/ports/out/alerts.ports.js";
import { createWorkspaceModule } from "./modules/workspace/workspace.module.js";
import { createReportsModule } from "./modules/reports/reports.module.js";
import { createDocumentDistributionsModule } from "./modules/document-distributions/document-distributions.module.js";
import { createLegalEntitiesModule } from "./modules/legal-entities/legal-entities.module.js";
import { createInvitationsModule } from "./modules/invitations/invitations.module.js";
import type { ReportRow } from "./modules/reports/domain/entities/report.js";
import { SupabaseAbsencesDirectory } from "./modules/absences/adapters/out/supabase-absences-directory.js";
import type { OrganizationId } from "./kernel/organization-id.js";
import { SupabaseEmployeeSegments, SupabaseSettingsImpact } from "./modules/settings/adapters/out/supabase-settings.adapters.js";
import { SupabasePeopleRepository } from "./modules/people/adapters/out/supabase-people.repository.js";
import { portugueseNationalHolidays } from "./modules/calendar/domain/services/portuguese-holidays.service.js";
import { OrganizationTimezoneClock } from "./modules/settings/adapters/out/supabase-settings.adapters.js";
import { can } from "./modules/access/domain/services/effective-access.service.js";
import { problemHandler } from "./infra/http/problem-details.js";
import { runWithRequestMemo } from "./infra/scoped-db/request-memo.js";
import { mapLimit } from "./utils/mapLimit.js";
import { setKioskNovoRhGuard } from "./services/hrKioskService.js";

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
// Respostas JSON comprimidas (gzip/br): o painel e a Visão geral de 100+ pessoas pesam muito menos.
// Fluxos (text/event-stream, ex.: pedidos AirMenu) ficam de fora — comprimir atrasava cada evento.
app.use(compression({ filter: (req, res) => !String(res.getHeader("Content-Type") ?? "").includes("text/event-stream") && compression.filter(req, res) }));
app.use(express.json());
// GET: leituras idênticas à base dentro do mesmo pedido vão uma vez (request-memo.ts).
app.use((req, _res, next) => (req.method === "GET" ? runWithRequestMemo(next) : next()));
// ID de correlação em todos os pedidos (ADR-0022) — devolvido em X-Correlation-Id.
app.use(correlationId);

// Dashboard executivo: invalidação por evento — uma escrita bem-sucedida numa
// fonte limpa só as métricas afetadas dessa organização (o resto vive do TTL).
let dashboardCache: DashboardCachePort | null = null;
let invalidateOverviewToday: ((org: OrganizationId) => void) | null = null;
const DASHBOARD_INVALIDATION: [RegExp, DashboardMetric[]][] = [
  [/^\/api\/(me\/clock|novo-rh\/attendance)(\/|$)/, ["PEOPLE"]],
  [/^\/api\/novo-rh\/(absences|inbox\/decide)(\/|$)/, ["PEOPLE", "REQUESTS", "COVERAGE"]],
  [/^\/api\/novo-rh\/rosters(\/|$)/, ["COVERAGE", "REQUESTS"]],
  [/^\/api\/novo-rh\/workspace(\/|$)/, ["REQUESTS"]],
];
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const metrics = DASHBOARD_INVALIDATION.find(([re]) => re.test(req.path))?.[1];
  if (metrics)
    res.on("finish", () => {
      if (res.statusCode >= 400 || !req.auth?.orgId) return;
      dashboardCache?.invalidate(req.auth.orgId, metrics);
      if (metrics.includes("PEOPLE")) invalidateOverviewToday?.(req.auth.orgId);
    });
  next();
});

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
const suggestStockRoutingRef: { current: SuggestStockRoutingPort } = {
  current: { execute: async () => ({ send: null, source: "none", reason: "Sem predefinição", requiresDecision: false }) },
};
const suggestStockRoutingProxy: SuggestStockRoutingPort = {
  execute: (command) => suggestStockRoutingRef.current.execute(command),
};
// Identidade fiscal partilhada Financeiro/Stock (task v1.2 · F1): um documento real = uma identidade.
const fiscalDocumentsModule = createFiscalDocumentsModule();
const invoicesModule = createInvoicesModule(
  financialBaseModule.createSupplier,
  recordInvoiceFinalizedForStockProxy,
  getStockPurchaseReviewStatusProxy,
  deleteDraftStockPurchaseReviewProxy,
  fiscalDocumentsModule.fiscalDocuments,
  suggestStockRoutingProxy,
  financialBaseModule.updateSupplier,
);
setStockImportFiscalDocuments(fiscalDocumentsModule.fiscalDocuments);
// Migração do histórico com simulação (POST /api/fiscal-documents/backfill, dryRun por omissão).
const fiscalDocumentsRouter = fiscalDocumentsModule.routerWith({
    list: async (org) => {
      const q = createScopedQuery(org);
      const [inv, sup, imp] = await Promise.all([
        q.table("invoices").select("id, supplier_id, supplier_nif_snapshot, document_type, invoice_number, invoice_date, supplier_name, status, created_at").not("status", "in", "(draft_ai,pending_review,cancelled)"),
        q.table("suppliers").select("id, nif"),
        q.table("supplier_invoice_imports").select("id, supplier_name, invoice_number, invoice_date, supplier_nif, created_at").not("confirmed_at", "is", null),
      ]);
      for (const r of [inv, sup, imp]) if (r.error) throw new Error(r.error.message);
      const nifOf = new Map(((sup.data ?? []) as unknown as { id: string; nif: string | null }[]).map((s) => [s.id, s.nif]));
      type InvRow = { id: string; supplier_id: string | null; supplier_nif_snapshot: string | null; document_type: "invoice" | "credit_note"; invoice_number: string; invoice_date: string; supplier_name: string; created_at: string };
      type ImpRow = { id: string; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; supplier_nif: string | null; created_at: string };
      return [
        ...((inv.data ?? []) as unknown as InvRow[]).map((r) => ({
          origin: "finance" as const,
          id: r.id,
          createdAt: r.created_at,
          label: `${r.supplier_name} — ${r.invoice_number} (${r.invoice_date})`,
          input: { buyerLegalEntityId: null, issuerTaxId: r.supplier_nif_snapshot || (r.supplier_id ? (nifOf.get(r.supplier_id) ?? null) : null), issuerCountry: null, documentType: r.document_type, seriesNumber: r.invoice_number || null, atcud: null },
        })),
        ...((imp.data ?? []) as unknown as ImpRow[]).map((r) => ({
          origin: "stock" as const,
          id: r.id,
          createdAt: r.created_at,
          label: `Stock: ${r.supplier_name ?? "?"} — ${r.invoice_number ?? "?"} (${r.invoice_date ?? "?"})`,
          input: { buyerLegalEntityId: null, issuerTaxId: r.supplier_nif, issuerCountry: null, documentType: "invoice" as const, seriesNumber: r.invoice_number, atcud: null },
        })),
      ];
    },
  });
const stockPurchaseReviewModule = createStockPurchaseReviewModule(
  invoicesModule.getInvoice,
  invoicesModule.listInvoices,
  financialBaseModule.listCostCenterCategories,
  financialBaseModule.getSupplier,
  locationsModule.listLocations,
  financialBaseModule.supplierLocationRules,
);
suggestStockRoutingRef.current = stockPurchaseReviewModule.suggestStockRouting;
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
// Demonstração do Stock (3 cenários fictícios; independente da do RH): numa organização fictícia as vendas
// vêm do POS fictício «CaixaFlow POS» e nunca da Vendus (cuja chave é global).
const stockDemoModule = createStockDemoModule();
setDemoProductsSource(async (org, since, until) => {
  const sales = await stockDemoModule.demoPosSales.dailySales(org, since, until);
  if (!sales) return null;
  const byRef = new Map<string, { title: string; reference: string; qty: number; category: string }>();
  for (const s of sales) {
    const row = byRef.get(s.reference) ?? { title: s.title, reference: s.reference, qty: 0, category: "pizza" };
    row.qty += s.quantity;
    byRef.set(s.reference, row);
  }
  return [...byRef.values()];
});
const stockPlanningModule = createStockPlanningModule(
  locationsModule.listLocations,
  financialBaseModule.getSupplier,
  financialBaseModule.listSupplierDeliverySchedules,
  stockDemoModule.demoPosSales,
);

// RH (hexagonal) — construído aqui, antes do cron interno, para expor a
// geração diária das automatizações de turnos (RH 2.0). As rotas continuam
// montadas mais abaixo, depois do requireAuth.
// O Novo RH é o único sistema de ponto (2026-10-23, sem interruptor): a picagem antiga (Portal e quiosque) recusa sempre.
// Documents (motor único): criado antes do `hr`, que usa os envios do Portal por validar na sua caixa de pedidos.
const documentsModule = createDocumentsModule();
const hrModule = createHrModule({
  movedToNovoRh: async () => true,
  listPendingDocuments: documentsModule.listPendingDocuments,
});
setKioskNovoRhGuard(async () => true);

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
      // Criado mais abaixo (depende dos módulos do Novo RH); só é usado quando o cron corre.
      runNovoRhReminders: (org) => remindersModule.reminders.run(org),
    }),
  );
}

// Novo RH → Convites (FE-054): o pedido de adesão é público (sem sessão), por isso
// o router público monta-se antes do requireAuth. O contexto usa repositórios
// criados mais abaixo — só é chamado quando chega um pedido.
const invitationsModule = createInvitationsModule({
  context: {
    employeeByEmail: async (org, email) =>
      (await peopleRepo.list(org, { status: "all" })).find((e) => [e.email, e.personalEmail].some((m) => m?.trim().toLowerCase() === email))?.id ?? null,
    now: () => new Date().toISOString(),
    audit: (org, e) => novoRhAudit(org, e, "invitation"),
  },
});
app.use("/api", invitationsModule.publicRouter);

// All routes below this line require authentication
app.use(requireAuth);

// Utilizadores & Perfis de Acesso 2.0: acesso efetivo (perfil + exceções +
// estado) lido da BD por pedido — conta desativada é recusada já aqui.
// Novo RH: auditoria transversal e estrutura criadas antes dos acessos (que as usam);
// os routers montam-se mais abaixo, depois da autenticação.
const auditModule = createAuditModule();
const orgStructureModule = createOrgStructureModule({ audit: auditModule.recorder });
// MFA opcional por empresa (Configurações → Segurança): lido no máximo uma vez por minuto por organização.
const mfaByOrg = new Map<string, { at: number; value: Promise<boolean> }>();
const orgRequiresMfa = (org: OrganizationId): Promise<boolean> => {
  const hit = mfaByOrg.get(org);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const value = settingsModule.settings.companyValue(org, "security.mfa.required").then((v) => v === true);
  value.catch(() => mfaByOrg.delete(org));
  mfaByOrg.set(org, { at: Date.now(), value });
  return value;
};
const accessModule = createAccessModule({
  mfa: ENV.MFA_ENFORCEMENT,
  orgRequiresMfa,
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
  // Cenário da demonstração pelos casos de uso dos módulos donos (as mesmas regras do uso real).
  // Os módulos de escalas e ausências são criados mais abaixo; só se usam quando o cenário corre.
  scenario: {
    hasScenario: async (org) => (await rostersModule.rosters.listRosters(org)).length > 0,
    build: async (org, actor, plan) => {
      const templates = new Map<string, string>();
      for (const t of plan.templates) templates.set(t.name, (await rostersModule.rosters.createTemplate(org, actor, { name: t.name, abbreviation: t.abbreviation, color: t.color, onCall: false, segments: t.segments })).id);
      for (const r of plan.rosters) {
        const roster = await rostersModule.rosters.createRoster(org, actor, { name: r.name, targetType: "location", targetId: r.locationId });
        const assign = (range: { from: string; to: string }) =>
          Promise.all(r.groups.map((g) => rostersModule.rosters.assignBulk(org, actor, roster.id, { employeeIds: g.employeeIds, from: range.from, to: range.to, weekdays: g.weekdays, kind: "shift", templateId: templates.get(g.templateName) ?? null })));
        await assign(r.published);
        await rostersModule.rosters.publish(org, actor, roster.id, { reason: "Escala de demonstração", confirm: true });
        await assign(r.draft);
      }
      const vacation = (await absencesModule.absences.listTypes(org)).find((t) => t.category === "vacation" && !t.archived);
      let approved = 0;
      let pending = 0;
      if (vacation) {
        await absencesModule.absences.createFlow(org, actor, { name: "Aprovação de férias (demo)", scope: "absences", isDefault: true, levels: [{ people: [actor.userId], roles: [] }], fallbackUserIds: [actor.userId] });
        const input = (a: { employeeId: string; startDate: string; endDate: string }, comment: string) => ({ ...a, typeId: vacation.id, startTime: null, endTime: null, halfDay: false, comment, attachmentDocumentId: null });
        const attempt = async (fn: () => Promise<unknown>) => {
          try {
            await fn();
            return 1;
          } catch (e) {
            console.error("[demo] ausência do cenário recusada:", e instanceof Error ? e.message : e);
            return 0;
          }
        };
        for (const a of plan.approved) approved += await attempt(() => absencesModule.absences.createRequest(org, actor, input(a, "Férias marcadas (demonstração)"), "assign"));
        // Pedidos feitos "pelo colaborador" (conta fictícia) — ficam à espera do Admin na caixa de Pedidos.
        for (const p of plan.pending) pending += await attempt(() => absencesModule.absences.createRequest(org, { userId: `demo-colaborador:${p.employeeId}`, email: "colaborador@demo.invalid" }, input(p, "Pedido de férias (demonstração)"), "self"));
      }
      return { rosters: plan.rosters.length, approved, pending };
    },
    // Enriquecimento para apresentações (só o que falta), pelos casos de uso dos módulos donos.
    enrich: async (org, actor, plan) => {
      const out = { periodClosed: false, rules: 0, pending: 0, alerts: 0, errors: [] as string[] };
      const step = async (name: string, fn: () => Promise<void>) => {
        try {
          await fn();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          out.errors.push(`${name}: ${msg}`);
          console.error(`[demo] enriquecimento (${name}) falhou:`, msg);
        }
      };
      await step("pedidos", async () => {
        const vacation = (await absencesModule.absences.listTypes(org)).find((t) => t.category === "vacation" && !t.archived);
        if (!vacation) return;
        const pendingNow = (await absencesModule.absences.listRequests(org, { status: "pending" }, false, "sistema")).length;
        // Pelo menos 8 pedidos à espera (mais material na caixa de Pedidos — 2026-10-19).
        for (const p of plan.extraPending.slice(0, Math.max(0, 8 - pendingNow))) {
          try {
            await absencesModule.absences.createRequest(org, { userId: `demo-colaborador:${p.employeeId}`, email: "colaborador@demo.invalid" }, { ...p, typeId: vacation.id, startTime: null, endTime: null, halfDay: false, comment: "Pedido de férias (demonstração)", attachmentDocumentId: null }, "self");
            out.pending++;
          } catch {
            /* datas recusadas pelas regras: segue */
          }
        }
      });
      await step("alertas", async () => {
        if (!(await alertsModule.alerts.listRules(org)).length)
          for (const r of plan.alertRules) {
            await alertsModule.alerts.createRule(org, actor, { kind: r.kind, thresholdDays: r.thresholdDays, owner: "admins", slaHours: r.slaHours, escalateTo: null, enabled: true });
            out.rules++;
          }
        out.alerts = (await alertsModule.alerts.evaluate(org)).opened;
      });
      await step("fecho", async () => {
        const exists = (await periodsModule.periods.listPeriods(org)).some((p) => p.scopeType === "organization" && p.startDate <= plan.closePeriod.endDate && p.endDate >= plan.closePeriod.startDate);
        if (exists) return;
        const p = await periodsModule.periods.createPeriod(org, actor, { scopeType: "organization", scopeId: null, ...plan.closePeriod });
        const { pending } = await periodsModule.periods.precheck(org, p.id);
        await periodsModule.periods.close(org, actor, p.id, pending.length ? "Fecho de demonstração com exceções (dados fictícios)." : null);
        out.periodClosed = true;
      });
      return out;
    },
    // Em dia com o calendário (só o que falta): ausências de hoje e escalas da semana atual/seguinte.
    keepCurrent: async (org, actor, plan) => {
      const out = { absencesToday: 0, shifts: 0, errors: [] as string[] };
      const fail = (name: string, e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        out.errors.push(`${name}: ${msg}`);
        console.error(`[demo] em dia (${name}) falhou:`, msg);
      };
      try {
        const vacation = (await absencesModule.absences.listTypes(org)).find((t) => t.category === "vacation" && !t.archived);
        if (vacation && plan.absencesToday.length) {
          const today = await absencesModule.absences.listRequests(org, { from: plan.today, to: plan.today }, true, "sistema");
          const busy = new Set(today.filter((r) => r.status === "approved" || r.status === "pending").map((r) => r.employeeId));
          for (const a of plan.absencesToday) {
            if (busy.has(a.employeeId)) continue;
            try {
              await absencesModule.absences.createRequest(org, actor, { ...a, typeId: vacation.id, startTime: null, endTime: null, halfDay: false, comment: "Ausência (demonstração)", attachmentDocumentId: null }, "assign");
              out.absencesToday++;
            } catch {
              /* recusada pelas regras (ex.: período fechado): segue */
            }
          }
        }
      } catch (e) {
        fail("ausências", e);
      }
      try {
        const [rosters, templates] = await Promise.all([rostersModule.rosters.listRosters(org), rostersModule.rosters.listTemplates(org)]);
        const tpl = new Map(templates.filter((t) => !t.archived).map((t) => [t.name, t.id]));
        for (const r of plan.rosters) {
          const roster = rosters.find((x) => !x.archived && x.targetType === "location" && x.targetId === r.locationId);
          if (!roster) continue;
          for (const [range, publishIt] of [[plan.weeks.current, true], [plan.weeks.next, false]] as const) {
            const has = new Set((await rostersModule.rosters.listShifts(org, roster.id, range.from, range.to)).shifts.filter((s) => !s.deleted).map((s) => s.employeeId));
            let created = 0;
            for (const g of r.groups) {
              const ids = g.employeeIds.filter((id) => !has.has(id));
              const templateId = tpl.get(g.templateName);
              if (!ids.length || !templateId) continue;
              try {
                created += (await rostersModule.rosters.assignBulk(org, actor, roster.id, { employeeIds: ids, from: range.from, to: range.to, weekdays: g.weekdays, kind: "shift", templateId })).created;
              } catch (e) {
                fail(`escala ${roster.name}`, e);
              }
            }
            out.shifts += created;
            if (publishIt && created) await rostersModule.rosters.publish(org, actor, roster.id, { reason: "Escala de demonstração (semana atual)", confirm: true, from: range.from, to: range.to });
          }
        }
      } catch (e) {
        fail("escalas", e);
      }
      // Áreas fictícias por centro (Sala, Caixa, Cozinha, Bar) e área nos turnos da semana atual e seguinte que não a têm.
      try {
        const rosters = await rostersModule.rosters.listRosters(org);
        for (const r of plan.rosters) {
          const roster = rosters.find((x) => !x.archived && x.targetType === "location" && x.targetId === r.locationId);
          if (!roster) continue;
          const existing = await rostersModule.rosters.listAreas(org, r.locationId);
          for (const name of DEMO_AREAS) {
            if (!existing.some((a) => a.active && a.name.toLocaleLowerCase("pt") === name.toLocaleLowerCase("pt"))) await rostersModule.rosters.createArea(org, actor, { locationId: r.locationId, name });
          }
          const areas = (await rostersModule.rosters.listAreas(org, r.locationId)).filter((a) => a.active && DEMO_AREAS.includes(a.name)).sort((a, b) => DEMO_AREAS.indexOf(a.name) - DEMO_AREAS.indexOf(b.name));
          if (!areas.length) continue;
          const pick = (employeeId: string, workDate: string) => areas[demoAreaIndex(employeeId, workDate, areas.length)]?.id ?? null;
          await rostersModule.rosters.fillMissingAreasForDemo(org, actor, roster.id, plan.weeks.current.from, plan.weeks.next.to, pick);
        }
      } catch (e) {
        fail("áreas", e);
      }
      return out;
    },
  },
  onError: (e) => console.error("[demo] atualização da demonstração falhou:", e instanceof Error ? e.message : e),
});
app.use(demoOrgModule.demoContext);
app.use("/api", demoOrgModule.router);
// Demonstração do Stock: X-Stock-Demo troca para a organização fictícia só nas rotas da Gestão de Stock.
app.use(stockDemoModule.stockDemoContext);
app.use("/api", stockDemoModule.router);
// Rotas do Portal (/api/me/*) logo aqui: as montagens seguintes com
// requireMinRole(...) no próprio mount correm para todo o /api e recusariam
// o colaborador antes de chegar a elas.
app.use("/api", hrModule.meRouter);
// Documentos do próprio (/me/documents*, ADR-0040 fase 1).
app.use("/api", documentsModule.meRouter);
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
  pinHasher: (pin) => (ENV.HR_KIOSK_HMAC_SECRET ? hashPin(ENV.HR_KIOSK_HMAC_SECRET, pin) : null),
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
  // Portal: «Mostrar os turnos dos colegas» (segurança) e só nome/cargo dos colegas.
  securitySettings: (org, employeeId, date) => settingsModule.settings.effectiveFor(org, employeeId, date, "security"),
  locationNames: async (org) => new Map((await peopleRepo.listLocations(org)).map((l) => [l.id, l.name])),
  peopleBrief: async (org, ids) => {
    const [people, positions] = await Promise.all([Promise.all(ids.map((id) => peopleRepo.get(org, id))), peopleRepo.listPositions(org)]);
    const pos = new Map(positions.map((p) => [p.id, p.name]));
    return people.flatMap((e) => (e ? [{ id: e.id, fullName: e.fullName, positionName: e.positionId ? (pos.get(e.positionId) ?? null) : null, active: e.status === "active" }] : []));
  },
  // Seletor de colaboradores: centro = principal da ficha ∪ pertenças datadas; grupo = membros do grupo.
  targetMembers: async (org, targetType, targetId, date) => {
    const [assigned, primary] = await Promise.all([
      orgStructureModule.structure.membersOf(org, targetType, [targetId], date),
      targetType === "location" ? peopleRepo.list(org, { status: "active", locationId: targetId }).then((l) => l.map((e) => e.id)) : Promise.resolve([] as string[]),
    ]);
    return [...new Set([...assigned, ...primary])];
  },
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
  // Plano de Cobertura: funcionalidade opcional da empresa (desligada por omissão).
  coverageEnabled: async (org) => (await settingsModule.settings.companyValue(org, "time_tracking.roster.coverage_enabled")) === true,
  // Ligar/desligar nas Escalas grava o mesmo parâmetro (perfil geral, a partir de hoje, com motivo).
  setCoverageEnabled: (org, userId, enabled) =>
    settingsModule.settings.setCompanyValue(org, "time_tracking.roster.coverage_enabled", enabled, enabled ? "Plano de cobertura ligado nas Escalas" : "Plano de cobertura desligado nas Escalas", { userId, canRetroactive: false }),
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
  // FE-113: fluxo "Correções de ponto" (absences, âmbito clock) — o módulo de ausências é criado mais abaixo.
  correctionLevels: (org, employeeId, date, excluded) => absencesModule.absences.correctionLevels(org, employeeId, date, excluded),
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
  directory: async (org) => {
    const [people, locations] = await Promise.all([peopleRepo.list(org, { status: "active" }), peopleRepo.listLocations(org)]);
    const loc = new Map(locations.map((l) => [l.id, l.name]));
    return people.map((p) => ({ id: p.id, name: p.fullName, locationName: p.primaryLocationId ? (loc.get(p.primaryLocationId) ?? null) : null }));
  },
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

// Público (todos, centros, departamentos, grupos ou pessoas) → colaboradores ativos com a conta, se tiverem.
const resolveNovoRhAudience = async (org: OrganizationId, audience: { type: "all" } | { type: "locations" | "departments" | "groups" | "employees"; ids: string[] }) => {
  const active = await activeEmployees(org);
  let ids: string[];
  if (audience.type === "all") ids = active.map((e) => e.id);
  else if (audience.type === "employees") ids = active.filter((e) => audience.ids.includes(e.id)).map((e) => e.id);
  else {
    ids = [];
    for (const e of active) {
      const units = await segments.segmentsOf(org, e.id, todayUtc());
      const mine = audience.type === "locations" ? units.locationIds : audience.type === "departments" ? units.departmentIds : units.groupIds;
      if (mine.some((x) => audience.ids.includes(x))) ids.push(e.id);
    }
  }
  return Promise.all(ids.map(async (employeeId) => ({ employeeId, userId: await absencesDirectory.userOfEmployee(org, employeeId) })));
};

const announcementsModule = createAnnouncementsModule({
  context: {
    resolveAudience: resolveNovoRhAudience,
    employeeForUser: (org, userId) => absencesDirectory.employeeForUser(org, userId),
    employeeNames: async (org) => new Map((await peopleRepo.list(org, { status: "all" })).map((p) => [p.id, p.fullName])),
    notify: (org, userIds, n) => inAppNotify(org, userIds, n, "announcements.new"),
    now: () => new Date().toISOString(),
    audit: (org, e) => novoRhAudit(org, e, "announcement"),
  },
});
app.use("/api", announcementsModule.router);

// Novo RH → Documentos (FE-065): enviar um documento a vários colaboradores, com confirmação de leitura.
const documentDistributionsModule = createDocumentDistributionsModule({
  context: {
    resolveAudience: resolveNovoRhAudience,
    employeeForUser: (org, userId) => absencesDirectory.employeeForUser(org, userId),
    employeeNames: async (org) => new Map((await peopleRepo.list(org, { status: "all" })).map((p) => [p.id, p.fullName])),
    notify: (org, userIds, n) => inAppNotify(org, userIds, n, "documents.distribution"),
    now: () => new Date().toISOString(),
    audit: (org, e) => novoRhAudit(org, e, "document_distribution"),
  },
});
app.use("/api", documentDistributionsModule.router);

// Novo RH → Entidades legais (FE-092) e a entidade de cada centro (FE-093).
const legalEntitiesModule = createLegalEntitiesModule({
  context: {
    activeLocations: (org) => peopleRepo.listLocations(org),
    activeContractsAt: async (org, locationIds) => {
      const today = todayUtc();
      let n = 0;
      for (const e of await activeEmployees(org)) {
        if (!e.primaryLocationId || !locationIds.includes(e.primaryLocationId)) continue;
        n += (await peopleRepo.listContracts(org, e.id)).filter((c) => c.status === "active" && c.startDate <= today && (c.endDate === null || c.endDate >= today)).length;
      }
      return n;
    },
    now: () => new Date().toISOString(),
    audit: (org, e) => novoRhAudit(org, { actor: e.actor, action: e.action, resourceId: e.resourceId, after: { before: e.before, after: e.after }, reason: e.reason }, "legal_entity"),
  },
});
app.use("/api", legalEntitiesModule.router);
app.use("/api", invitationsModule.router);

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
      return s?.value === "organization" ? "organization" : s?.value === "off" ? "off" : "own_location";
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
        } else if (key === "contracts") {
          const today = todayUtc();
          const TYPE: Record<string, string> = { permanent: "Sem termo", fixed_term: "Termo certo", temporary: "Temporário", internship: "Estágio", other: "Outro" };
          for (const c of await peopleRepo.listContracts(org, e.id)) {
            const state = c.status === "cancelled" ? "Anulado" : c.startDate > today ? "Futuro" : c.endDate !== null && c.endDate < today ? "Terminado" : "Em vigor";
            rows.push({ employeeId: e.id, employee: e.fullName, type: TYPE[c.contractType] ?? c.contractType, start: c.startDate, end: c.endDate ?? "", weeklyHours: c.weeklyHours ?? "", probationEnd: c.probationEnd ?? "", state });
          }
        }
      }
      return rows;
    },
    employeeLocations: async (org) => new Map((await peopleRepo.list(org, { status: "all" })).map((e) => [e.id, e.primaryLocationId])),
  },
  // Relatórios → Assiduidade (2026-10-22): o motor em lote (≤ 31 dias por pedido), grupos e departamentos com vigência.
  attendanceDays: {
    people: async (org) =>
      (await peopleRepo.list(org, { status: "all" })).map((e) => ({ id: e.id, name: e.fullName, locationId: e.primaryLocationId, hireDate: e.hireDate, status: e.status, deactivatedAt: e.deactivatedAt })),
    units: async (org, date) => {
      const out = new Map<string, { groups: string[]; departments: string[] }>();
      for (const a of await orgStructureModule.structure.listAssignments(org, {})) {
        if (a.unitType === "location" || a.validFrom > date || (a.validTo !== null && a.validTo < date)) continue;
        const u = out.get(a.employeeId) ?? { groups: [], departments: [] };
        (a.unitType === "group" ? u.groups : u.departments).push(a.unitId);
        out.set(a.employeeId, u);
      }
      return out;
    },
    daysMany: async (org, employeeIds, from, to) => {
      const all = await attendanceModule.attendance.boardMany(org, employeeIds, from, to);
      return new Map([...all].map(([id, b]) => [id, b.days]));
    },
  },
  access: {
    canSeeEmployee,
    canAudit: (req) => !!req.access && can(req.access, "governance.audit", "READ"),
  },
});
app.use("/api", reportsModule.router);

// Novo RH → Painel (visão do dono): quem está, quem faltou, atrasos, ausências e pendentes do dia.
const overviewModule = createOverviewModule({
  sources: {
    today: (org) => new OrganizationTimezoneClock(createScopedQuery).today(org),
    employees: async (org) => (await activeEmployees(org)).map((e) => ({ id: e.id, name: e.fullName, locationId: e.primaryLocationId })),
    locations: (org) => peopleRepo.listLocations(org),
    days: async (org, employeeId, from, to) => {
      const b = await attendanceModule.attendance.board(org, employeeId, from, to);
      return { timeZone: b.timeZone, days: b.days };
    },
    // Em lote: marcações, revisões e incidentes de todos numa leitura (perf da Visão geral).
    daysMany: async (org, employeeIds, from, to, concurrency) => {
      const all = await attendanceModule.attendance.boardMany(org, employeeIds, from, to, concurrency);
      return new Map([...all].map(([id, b]) => [id, { timeZone: b.timeZone, days: b.days }]));
    },
    absences: async (org, from, to, canPrivate) =>
      (await absencesModule.absences.listRequests(org, { status: "approved", from, to }, canPrivate, "sistema")).map((r) => ({ employeeId: r.employeeId, typeName: r.typeName, category: r.typeCategory, startDate: r.startDate, endDate: r.endDate })),
    pending: async (org) => {
      const today = todayUtc();
      const [absences, corrections, incidents, requests, alerts] = await Promise.all([
        absencesModule.absences.listRequests(org, { status: "pending" }, false, "sistema"),
        attendanceModule.attendance.listCorrections(org, { status: "pending" }),
        attendanceModule.attendance.listIncidents(org, { status: "open", from: new Date(Date.parse(today) - 90 * 86_400_000).toISOString().slice(0, 10), to: today }),
        workspaceModule.workspace.listRequests(org, "pending"),
        alertsModule.alerts.list(org, "active"),
      ]);
      return { absenceRequests: absences.length, corrections: corrections.length, incidents: incidents.length, customRequests: requests.length, alerts: alerts.length };
    },
    holidays: async (org, from, limit) => {
      const seen = new Map<string, string>();
      for (const c of await timeBaseModule.time.listHolidayCalendars(org)) for (const d of c.days) if (d.date >= from && !seen.has(d.date)) seen.set(d.date, d.name);
      return [...seen].sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([date, name]) => ({ date, name }));
    },
  },
  viewerOf: (req) => ({
    canSee: (employeeId, date) => canSeeEmployee(req, employeeId, date),
    canPrivate: !!req.access && can(req.access, "hr.absences_private", "MANAGE"),
  }),
});
app.use("/api", overviewModule.router);

// Novo RH → Caixa de pedidos (FE-050): ausências, correções, excedente, trocas e solicitações
// num só sítio; cada decisão passa pela regra do módulo dono (RE-22/23, período fechado).
/** Pessoas em paralelo na fonte "Excedente de horas" da Caixa de pedidos. */
const INBOX_OVERTIME_CONCURRENCY = 8;
const isOwn = async (org: OrganizationId, userId: string, employeeId: string) => (await absencesDirectory.userOfEmployee(org, employeeId)) === userId;
const hm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
const inboxViewerOf = (req: Parameters<Parameters<typeof createInboxModule>[0]["viewerOf"]>[0]) => ({
  actor: { userId: req.auth!.sub, email: req.auth!.email || req.auth!.sub },
  can: (permission: Parameters<typeof can>[1], level: Parameters<typeof can>[2]) => !!req.access && can(req.access, permission, level),
  canSee: (employeeId: string) => canSeeEmployee(req, employeeId, todayUtc()),
  canPrivate: !!req.access && can(req.access, "hr.absences_private", "MANAGE"),
});
const inboxModule = createInboxModule({
  directory: {
    people: async (org) => {
      const [people, locations] = await Promise.all([peopleRepo.list(org, { status: "all" }), peopleRepo.listLocations(org)]);
      const loc = new Map(locations.map((l) => [l.id, l.name]));
      return people.map((p) => ({ id: p.id, name: p.fullName, locationName: p.primaryLocationId ? (loc.get(p.primaryLocationId) ?? null) : null }));
    },
  },
  sources: [
    {
      type: "leave",
      permission: "hr.leave",
      list: async (org, actor, { canPrivate }) => {
        const out = [];
        for (const r of await absencesModule.absences.listRequests(org, { status: "pending" }, canPrivate, actor.userId)) {
          const own = r.requestedByUserId === actor.userId || (await isOwn(org, actor.userId, r.employeeId));
          const level = r.levels[r.currentLevel];
          out.push({
            type: "leave" as const,
            id: r.id,
            employeeId: r.employeeId,
            requestedAt: r.createdAt,
            title: r.typeName,
            detail: `${r.startDate}${r.endDate !== r.startDate ? ` a ${r.endDate}` : ""} · ${r.amount} ${r.unit === "days" ? "dia(s)" : "hora(s)"}`,
            meta: [...(level?.escalated ? [{ label: "Nível", value: "Sem aprovador — encaminhado para o aprovador de recurso" }] : []), ...(r.private ? [] : r.comment ? [{ label: "Comentário", value: r.comment }] : [])],
            blockedReason: own ? ("own" as const) : level?.approvers.includes(actor.userId) ? null : ("not_current_level" as const),
            level: { current: r.currentLevel + 1, total: r.levels.length },
          });
        }
        return out;
      },
      decide: async (org, actor, item, decision, comment) => void (await absencesModule.absences.decide(org, actor, item.id, decision, comment)),
    },
    {
      type: "clock",
      permission: "hr.attendance",
      list: async (org, actor) => {
        const out = [];
        for (const c of await attendanceModule.attendance.listCorrections(org, { status: "pending" })) {
          const op = c.operation === "add" ? "Acrescentar marcação" : c.operation === "void" ? "Anular marcação" : "Alterar marcação";
          out.push({
            type: "clock" as const,
            id: c.id,
            employeeId: c.employeeId,
            requestedAt: c.createdAt,
            title: "Correção de ponto",
            detail: `${op}${c.occurredAt ? ` · ${c.occurredAt.slice(0, 10)} ${hm(c.occurredAt)} UTC` : ""}`,
            meta: [{ label: "Motivo", value: c.reason }],
            blockedReason: (await isOwn(org, actor.userId, c.employeeId)) ? ("own" as const) : c.levels.length && !c.levels[c.currentLevel]?.approvers.includes(actor.userId) ? ("not_current_level" as const) : null,
            level: c.levels.length ? { current: c.currentLevel + 1, total: c.levels.length } : null,
          });
        }
        return out;
      },
      decide: async (org, actor, item, decision, comment) => void (await attendanceModule.attendance.decideCorrection(org, actor, item.id, decision, comment)),
    },
    {
      type: "overtime",
      permission: "hr.attendance",
      // Uma pessoa de cada vez somava as latências de toda a equipa (Visão geral > 15 s);
      // em paralelo limitado, com a mesma ordem e as mesmas regras.
      list: async (org, actor, { employeeIds }) => {
        // Validação de excedente desligada por omissão: se nenhum perfil a ligou, nada a procurar
        // (antes recalculava 92 dias de assiduidade por pessoa em cada abertura dos Pedidos).
        if (!(await settingsModule.settings.everTrue(org, "time_tracking.bank.excess_validation"))) return [];
        const perEmployee = await mapLimit(employeeIds, INBOX_OVERTIME_CONCURRENCY, async (employeeId) => {
          const [own, pending] = await Promise.all([isOwn(org, actor.userId, employeeId), timeBankModule.timeBank.pendingValidations(org, employeeId)]);
          return pending.map((v) => {
            const h = Math.floor(v.excessSeconds / 3600);
            const m = Math.floor((v.excessSeconds % 3600) / 60);
            return {
              type: "overtime" as const,
              id: `${employeeId}|${v.workDate}`,
              employeeId,
              requestedAt: `${v.workDate}T23:59:59.000Z`,
              title: "Excedente de horas",
              detail: `${v.workDate} · +${h}h ${String(m).padStart(2, "0")}min`,
              meta: [],
              blockedReason: own ? ("own" as const) : null,
              level: null,
            };
          });
        });
        return perEmployee.flat();
      },
      decide: async (org, actor, item, decision, comment) => void (await timeBankModule.timeBank.decideValidation(org, actor, item.employeeId, item.id.split("|")[1]!, decision, comment)),
    },
    {
      type: "swap",
      permission: "hr.schedules",
      list: async (org, actor) => {
        const names = new Map((await peopleRepo.list(org, { status: "all" })).map((p) => [p.id, p.fullName]));
        const out = [];
        for (const s of await rostersModule.rosters.listSwaps(org, "pending_manager")) {
          const own = (await isOwn(org, actor.userId, s.requesterEmployeeId)) || (await isOwn(org, actor.userId, s.targetEmployeeId));
          out.push({
            type: "swap" as const,
            id: s.id,
            employeeId: s.requesterEmployeeId,
            requestedAt: s.createdAt,
            title: "Troca de turno",
            detail: `Com ${names.get(s.targetEmployeeId) ?? "colega"}${s.counterShiftId ? " (troca de turnos)" : " (cede o turno)"}`,
            meta: s.comment ? [{ label: "Comentário", value: s.comment }] : [],
            blockedReason: own ? ("own" as const) : null,
            level: null,
          });
        }
        return out;
      },
      decide: async (org, actor, item, decision, comment) => void (await rostersModule.rosters.decideSwap(org, actor, item.id, decision === "approve", comment, false)),
    },
    {
      type: "custom",
      permission: "hr.employees",
      list: async (org, actor) => {
        const forms = new Map((await workspaceModule.workspace.listForms(org)).map((f) => [f.id, f]));
        const out = [];
        for (const r of await workspaceModule.workspace.listRequests(org, "pending")) {
          out.push({
            type: "custom" as const,
            id: r.id,
            employeeId: r.employeeId,
            requestedAt: r.createdAt,
            title: forms.get(r.formId)?.title ?? "Solicitação",
            detail: r.dueAt ? `Prazo ${r.dueAt.slice(0, 10)}` : "Sem prazo",
            meta: Object.entries(r.answers)
              .slice(0, 6)
              .map(([fieldId, v]) => ({ label: forms.get(r.formId)?.fields.find((f) => f.id === fieldId)?.title ?? fieldId, value: Array.isArray(v) ? v.join(", ") : v })),
            blockedReason: r.requestedByUserId === actor.userId || (await isOwn(org, actor.userId, r.employeeId)) ? ("own" as const) : null,
            level: null,
          });
        }
        return out;
      },
      decide: async (org, actor, item, decision, comment) => void (await workspaceModule.workspace.decide(org, actor, item.id, decision, comment)),
    },
  ],
  viewerOf: (req) => inboxViewerOf(req),
});
app.use("/api", inboxModule.router);

// Novo RH → Dashboard executivo: agrega painel + caixa de pedidos + escalas
// num só pedido (OperationalSnapshot); listas só a pedido; layout pessoal.
const dashboardModule = createDashboardModule({
  sources: {
    tomorrowOf: (today) => new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
    coverage: async (org, employees, from, to) => {
      const rostered = new Set((await rostersModule.rosters.listRosters(org)).filter((r) => !r.archived && r.targetType === "location").map((r) => r.targetId));
      const inRoster = employees.filter((e) => e.locationId && rostered.has(e.locationId));
      if (!inRoster.length) return [];
      const absences = await absencesModule.absences.listRequests(org, { status: "approved", from, to }, false, "sistema");
      const absent = (id: string, d: string) => absences.some((a) => a.employeeId === id && a.startDate <= d && a.endDate >= d);
      const gaps: { employeeId: string; name: string; locationId: string | null; date: string }[] = [];
      for (let i = 0; i < inRoster.length; i += 6) {
        await Promise.all(
          inRoster.slice(i, i + 6).map(async (e) => {
            // Uma pessoa com dados incompletos (ex.: sem horário) não falha a cobertura das outras.
            try {
              const [{ days }, planned] = await Promise.all([timeBaseModule.time.theoretical(org, e.id, from, to), rostersModule.rosters.plannedFor(org, e.id, from, to)]);
              for (const d of days) if (d.minutes > 0 && (d.reason === "schedule" || d.reason === "contract") && !planned.has(d.date) && !absent(e.id, d.date)) gaps.push({ employeeId: e.id, name: e.name, locationId: e.locationId, date: d.date });
            } catch {
              /* sem dados para esta pessoa: fica fora da cobertura */
            }
          }),
        );
      }
      return gaps;
    },
    birthDates: async (org) => {
      const [people, locations] = await Promise.all([peopleRepo.list(org, { status: "active" }), peopleRepo.listLocations(org)]);
      const loc = new Map(locations.map((l) => [l.id, l.name]));
      return people.map((p) => ({ employeeId: p.id, name: p.fullName, locationName: p.primaryLocationId ? (loc.get(p.primaryLocationId) ?? null) : null, birthDate: p.birthDate }));
    },
  },
  viewerOf: async (req) => {
    const org = req.auth!.orgId;
    const access = req.access!;
    const who = { userId: req.auth!.sub, isAdmin: access.isAdmin, profileId: access.profile.id };
    const [canSee, field] = await Promise.all([accessModule.governance.scopeChecker(org, who), accessModule.governance.fieldAccessFor(org, who.profileId, who.isAdmin)]);
    const canPrivate = can(access, "hr.absences_private", "MANAGE");
    return {
      userId: req.auth!.sub,
      canSee,
      canSeeBirthdays: field("personal.birth_date").view,
      people: async () => {
        // Só hoje (sem a semana do painel): muito menos apuramento por pessoa.
        const o = await overviewModule.overview.today(org, { canSee, canPrivate });
        return {
          today: o.date,
          holidays: o.holidays,
          people: o.people.map((p) => ({ employeeId: p.employeeId, name: p.name, locationId: p.locationId, locationName: p.locationName, status: p.status, lateMinutes: p.lateMinutes, plannedStart: p.plannedStart, plannedEnd: p.plannedEnd, firstInAt: p.firstInAt, absenceType: p.absenceType, absenceCategory: p.absenceCategory ?? null })),
        };
      },
      requests: async () =>
        (await inboxModule.inbox.list(org, inboxViewerOf(req), { type: null, segment: "all" })).items.map((r) => ({ key: r.key, type: r.type, employeeId: r.employeeId, employeeName: r.employeeName, locationName: r.locationName, title: r.title, requestedAt: r.requestedAt, canDecide: r.canDecide })),
    };
  },
});
dashboardCache = dashboardModule.cache;
invalidateOverviewToday = (org) => overviewModule.overview.invalidateToday(org);
app.use("/api", dashboardModule.router);

// Novo RH → Avaliações Google (Places API New): nota por local no Dashboard. A chave
// (GOOGLE_PLACES_API_KEY) só existe no servidor; sem ela, "não configurado".
const googleReviewsModule = createGoogleReviewsModule({
  apiKey: process.env.GOOGLE_PLACES_API_KEY,
  locations: { locations: async (org) => (await peopleRepo.listLocations(org)).map((l) => ({ id: l.id, name: l.name })) },
  audit: {
    record: (org, e) => auditModule.recorder.record(org, { actor: e.actor, action: e.action, resourceType: "location", resourceId: e.resourceId, before: e.before, after: e.after, reason: null }),
  },
});
app.use("/api", googleReviewsModule.router);

// Novo RH → Escalas → Assistente Mezza: a IA interpreta; tudo é validado e executado pelos
// serviços canónicos das Escalas (sem segundo motor). Sem OPENAI_API_KEY: "indisponível".
const assistantShiftView = (s: { id: string; employeeId: string; workDate: string; kind: "shift" | "day_off"; segments: { start: string; end: string }[]; templateId: string | null; deleted: boolean; published: { segments: { start: string; end: string }[] } | null }) => ({
  id: s.id,
  employeeId: s.employeeId,
  workDate: s.workDate,
  kind: s.kind,
  segments: s.deleted && s.published ? s.published.segments : s.segments,
  templateId: s.templateId,
  pendingOnly: s.published === null && !s.deleted,
  published: s.published !== null,
});
const toSchedulingError = (e: unknown): never => {
  if (e instanceof RosterBlockedError) throw new SchedulingBlockedError(e.message, e.violations);
  if (e instanceof RosterValidationError || e instanceof RosterConflictError) throw new AssistantError(e.message, "validation");
  if (e instanceof RosterNotFoundError) throw new AssistantError(e.message, "not_found");
  throw e;
};
const assistantModule = createAssistantModule({
  // Fornecedor: ASSISTANT_PROVIDER=gemini|openai (vazio = Gemini se houver GEMINI_API_KEY, senão OpenAI).
  providers: {
    provider: process.env.ASSISTANT_PROVIDER,
    gemini: { apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-2.5-flash" },
    openai: { apiKey: ENV.OPENAI_API_KEY, model: process.env.ASSISTANT_MODEL || ENV.OPENAI_MODEL_TEXT, transcribeModel: process.env.ASSISTANT_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe" },
  },
  idempotencyStore: new SupabaseIdempotencyStore(createScopedQuery),
  viewerOf: (req) => ({
    userId: req.auth!.sub,
    email: req.auth!.email || req.auth!.sub,
    canRead: !!req.access && can(req.access, "hr.schedules", "READ"),
    canWrite: !!req.access && can(req.access, "hr.schedules", "MANAGE"),
    canPrivate: !!req.access && can(req.access, "hr.absences_private", "MANAGE"),
    canSee: (employeeId, date) => canSeeEmployee(req, employeeId, date),
  }),
  scheduling: {
    roster: async (org, rosterId) => {
      const r = (await rostersModule.rosters.listRosters(org)).find((x) => x.id === rosterId && !x.archived);
      return r ? { id: r.id, name: r.name, version: r.version, targetType: r.targetType, targetId: r.targetId } : null;
    },
    timeZone: async (org) => {
      const res = await createScopedQuery(org).table("organizations").select("timezone").maybeSingle();
      return ((res.data as { timezone?: string | null } | null)?.timezone || "Europe/Lisbon") as string;
    },
    today: (org) => new OrganizationTimezoneClock(createScopedQuery).today(org),
    employees: async (org, rosterId) => {
      const today = await new OrganizationTimezoneClock(createScopedQuery).today(org);
      const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const [people, positions, roster, recent] = await Promise.all([
        activeEmployees(org),
        peopleRepo.listPositions(org),
        rostersModule.rosters.listRosters(org).then((l) => l.find((x) => x.id === rosterId) ?? null),
        rostersModule.rosters.listShifts(org, rosterId, plus(-30), plus(31)).catch(() => ({ shifts: [] as { employeeId: string }[] })),
      ]);
      const pos = new Map(positions.map((p) => [p.id, p.name]));
      const inRoster = new Set(recent.shifts.map((s) => s.employeeId));
      return people.map((e) => ({ id: e.id, name: e.fullName, positionName: e.positionId ? (pos.get(e.positionId) ?? null) : null, member: inRoster.has(e.id) || (roster?.targetType === "location" && e.primaryLocationId === roster.targetId) }));
    },
    shifts: async (org, rosterId, from, to) => (await rostersModule.rosters.listShifts(org, rosterId, from, to)).shifts.map(assistantShiftView),
    templates: async (org) => (await rostersModule.rosters.listTemplates(org)).filter((t) => !t.archived).map((t) => ({ id: t.id, name: t.name, abbreviation: t.abbreviation, segments: t.segments })),
    availability: (org, rosterId, input) => rostersModule.rosters.availability(org, rosterId, input).catch(toSchedulingError),
    coverage: async (org, _rosterId, employees, from, to) => {
      const absences = await absencesModule.absences.listRequests(org, { status: "approved", from, to }, false, "sistema");
      const absent = (id: string, d: string) => absences.some((a) => a.employeeId === id && a.startDate <= d && a.endDate >= d);
      const perPerson = await mapLimit(employees, 6, async (e) => {
        try {
          const [{ days }, planned] = await Promise.all([timeBaseModule.time.theoretical(org, e.id, from, to), rostersModule.rosters.plannedFor(org, e.id, from, to)]);
          return days.filter((d) => d.minutes > 0 && (d.reason === "schedule" || d.reason === "contract") && !planned.has(d.date) && !absent(e.id, d.date)).map((d) => ({ employeeId: e.id, date: d.date, segments: d.plannedRanges }));
        } catch {
          return []; // sem horário/dados: esta pessoa fica fora da cobertura (como no Dashboard)
        }
      });
      return perPerson.flat().sort((a, b) => a.date.localeCompare(b.date));
    },
    conflicts: (org, rosterId) => rostersModule.rosters.check(org, rosterId),
    addShifts: async (org, actor, rosterId, shifts) => {
      const r = await rostersModule.rosters.addShifts(org, actor, rosterId, shifts.map((s) => ({ employeeId: s.employeeId, workDate: s.workDate, kind: "shift" as const, templateId: s.templateId, segments: s.segments })), "AI_AGENT").catch(toSchedulingError);
      return { created: r.created.map(assistantShiftView), warnings: r.warnings };
    },
    removePending: async (org, actor, rosterId, shifts) => {
      const byEmployee = new Map<string, typeof shifts>();
      for (const s of shifts) byEmployee.set(s.employeeId, [...(byEmployee.get(s.employeeId) ?? []), s]);
      const removed = [];
      for (const [employeeId, list] of byEmployee) {
        const dates = list.map((s) => s.workDate).sort();
        const r = await rostersModule.rosters.clearPending(org, actor, rosterId, { employeeId, from: dates[0]!, to: dates.at(-1)!, shiftIds: list.map((s) => s.id) }).catch(toSchedulingError);
        removed.push(...r.removed.map(assistantShiftView));
      }
      return removed;
    },
    restore: async (org, actor, rosterId, ids) => void (await rostersModule.rosters.restoreShifts(org, actor, rosterId, ids).catch(toSchedulingError)),
    createTemplate: async (org, actor, input) => {
      const t = await rostersModule.rosters.createTemplate(org, actor, { name: input.name, abbreviation: input.abbreviation, color: null, onCall: false, segments: input.segments }).catch(toSchedulingError);
      return { id: t.id, name: t.name, abbreviation: t.abbreviation, segments: t.segments };
    },
  },
  audit: {
    record: (org, e) =>
      auditModule.recorder.record(org, {
        actor: e.actor,
        action: `assistant.${e.command.toLowerCase()}`,
        resourceType: "roster",
        resourceId: null,
        before: null,
        after: { source: "AI_AGENT", command: e.command, structured: e.structured, affectedIds: e.affectedIds, result: e.result },
        reason: e.message,
      }),
  },
});
app.use("/api", assistantModule.router);
console.log(`[assistant] fornecedor: ${assistantModule.provider ?? "nenhum (sem chave)"}`);

// Novo RH → Avisos automáticos (FE-111): regras em Configurações → Notificações; cron de 10 em 10 min.
const remindersModule = createRemindersModule({
  sources: {
    today: (org) => new OrganizationTimezoneClock(createScopedQuery).today(org),
    employees: async (org) => (await activeEmployees(org)).map((e) => ({ id: e.id, name: e.fullName })),
    day: async (org, employeeId, date) => {
      const b = await attendanceModule.attendance.board(org, employeeId, date, date);
      const d = b.days[0]!;
      return { date, timeZone: b.timeZone, plannedStart: d.plannedStart, plannedEnd: d.plannedEnd, excused: d.excused, firstInAt: d.firstInAt, openNow: d.openType !== null };
    },
    settings: (org, employeeId, date) => settingsModule.settings.effectiveFor(org, employeeId, date, "notifications"),
    contracts: async (org, employeeId) => (await peopleRepo.listContracts(org, employeeId)).map((c) => ({ id: c.id, status: c.status, probationEnd: c.probationEnd, endDate: c.endDate })),
    employeeUser: (org, employeeId) => absencesDirectory.userOfEmployee(org, employeeId),
    directManagerUsers: async (org, employeeId, date) => {
      const links = (await peopleRepo.listManagers(org, employeeId)).filter((m) => m.kind === "direct" && m.validFrom <= date && (m.validTo === null || date <= m.validTo));
      return absencesDirectory.usersOfEmployees(org, links.map((m) => m.managerEmployeeId));
    },
    adminUsers: (org) => notificationsModule.notifications.adminUserIds(org),
  },
  notifier: { notify: (org, userIds, n) => inAppNotify(org, userIds, n, "novo_rh.reminder") },
});
app.use("/api", remindersModule.router);

// CRM: acessível a managers+
const crmModule = createCrmModule();
app.use("/api", crmModule.router);
app.use("/api", crmRoutes);

// Financial base module (hexagonal) — instantiated above, before requireAuth
app.use("/api", financialBaseModule.router);

// Invoices module (hexagonal) — instantiated above, before requireAuth
app.use("/api", invoicesModule.router);
app.use("/api", fiscalDocumentsRouter);

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

// Recipe costing module (hexagonal) — custo das fichas técnicas a partir do
// último custo de compra (faturas importadas) ou do custo manual do artigo.
const recipeCostingModule = createRecipeCostingModule();
app.use("/api", recipeCostingModule.router);

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
const bankStatementsModule = createBankStatementsModule(bankAccountsModule.accountRepo, financialBaseModule.listSuppliers, bankAccountsModule.resolveStatementAccount);
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
