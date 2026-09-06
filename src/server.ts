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
import { resolveClosingEnterpriseId } from "./modules/air-menu/domain/services/resolve-closing-enterprise-id.js";
import { populateAuth, requireAuth, requireMinRole } from "./middleware/auth.js";
import { authRoutes } from "./routes/authRoutes.js";
import { createLocationsModule } from "./modules/locations/locations.module.js";
import { createLocationCredentialsModule } from "./modules/location-credentials/location-credentials.module.js";

const app = express();

// CORS: permitir frontend Vercel (produção + previews *.vercel.app) e localhost
const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    const allowed =
      !origin ||
      origin === "http://localhost:5173" ||
      origin === "http://localhost:3000" ||
      /\.vercel\.app$/.test(origin);
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
  enterprises: ENV.AIRMENU_ENTERPRISES,
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

// All routes below this line require authentication
app.use(requireAuth);

// Admin-only: user management
app.use("/api/auth", requireMinRole("admin"), authRoutes);

// Locations module (hexagonal) — org-scoped read, any authenticated role (D15)
const locationsModule = createLocationsModule();
app.use("/api", locationsModule.router);

// Location credentials admin routes (generate pairing code, list/revoke tokens)
app.use("/api", locationCredentialsModule.adminRouter);

// Manager+: financial, stock, documents, reports, pizza, preparations, analytics
app.use("/api", requireMinRole("manager"), analyticsRoutes);
app.use("/api", requireMinRole("manager"), documentsRoutes);
app.use("/api", requireMinRole("manager"), reportsRoutes);
app.use("/api", requireMinRole("manager"), dreRoutes);
app.use("/api", requireMinRole("manager"), stockRoutes);
app.use("/api", requireMinRole("manager"), supplierInvoiceImportRoutes);
app.use("/api", requireMinRole("manager"), pizzaRoutes);
app.use("/api", requireMinRole("manager"), preparationRoutes);

// HR routes: GETs allow hr_viewer; write handlers have inline requireMinRole("manager")
app.use("/api/hr", hrRoutes);
app.use("/api/hr", hrAuditRoutes);
app.use("/api/hr", hrLeaveRoutes);

// CRM: acessível a managers+
const crmModule = createCrmModule();
app.use("/api", requireMinRole("manager"), crmModule.router);
app.use("/api", requireMinRole("manager"), crmRoutes);

// Financial base module (hexagonal)
const financialBaseModule = createFinancialBaseModule();
app.use("/api", requireMinRole("manager"), financialBaseModule.router);

// Invoices module (hexagonal) — recebe createSupplier do financial-base
const invoicesModule = createInvoicesModule(financialBaseModule.createSupplier);
app.use("/api", requireMinRole("manager"), invoicesModule.router);

// Payable entries module (hexagonal)
const payableEntriesModule = createPayableEntriesModule();
app.use("/api", requireMinRole("manager"), payableEntriesModule.router);

// Payable recurrences module (hexagonal)
const payableRecurrencesModule = createPayableRecurrencesModule();
app.use("/api", requireMinRole("manager"), payableRecurrencesModule.router);

// Bank accounts module (hexagonal) — must be before bank-statements
const bankAccountsModule = createBankAccountsModule();
app.use("/api", requireMinRole("manager"), bankAccountsModule.router);

// Bank statements module (hexagonal) — receives bank account read port for auto-linking
const bankStatementsModule = createBankStatementsModule(bankAccountsModule.accountRepo);
app.use("/api", requireMinRole("manager"), bankStatementsModule.router);

// Air Menu: rota protegida (módulo já instanciado acima)
app.use("/api", requireMinRole("manager"), airMenuModule.router);

// Vendus (hexagonal) — router registado aqui; módulo instanciado acima (antes do cash-closings)
// As routes legadas (/api/analytics/*, /api/documents, /api/reports/monthly-summary)
// continuam registadas acima durante a migração do frontend.
app.use("/api", requireMinRole("manager"), vendusModule.router);

// Cash closing manager routes (authenticated)
app.use("/api", requireMinRole("manager"), cashClosingsModule.managedRouter);

if (ENV.CRON_SECRET) {
  app.use("/api", createInternalCronRouter({ processDirectDebits: invoicesModule.processDirectDebits }));
}

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
