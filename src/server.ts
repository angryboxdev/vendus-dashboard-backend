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

const app = express();

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
};
app.use(cors(corsOptions));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

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
const accessModule = createAccessModule();
app.use(accessModule.guards.loadAccess);

// Portal do Colaborador: o papel `employee` só chega a `/api/me/*` — barreira
// por omissão, antes de qualquer rota de gestão (inclui as "qualquer role").
app.use(restrictEmployeeToPortalRoutes);
// Tabela central rota → permissão (Utilizadores & Perfis 2.0): substitui os
// antigos requireMinRole("manager") no mount, que se aplicavam a TODO o /api.
app.use(accessModule.guards.routeGuard);
// Rotas do Portal (/api/me/*) logo aqui: as montagens seguintes com
// requireMinRole(...) no próprio mount correm para todo o /api e recusariam
// o colaborador antes de chegar a elas.
app.use("/api", hrModule.meRouter);
app.use("/api", accessModule.meRouter);
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
