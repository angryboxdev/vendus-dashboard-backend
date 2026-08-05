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
import { createBankAccountsModule } from "./modules/bank-accounts/bank-accounts.module.js";
import { createBankStatementsModule } from "./modules/bank-statements/bank-statements.module.js";
import { createAirMenuModule } from "./modules/air-menu/air-menu.module.js";
import { createVendusModule } from "./modules/vendus/vendus.module.js";
import { supplierInvoiceImportRoutes } from "./routes/supplierInvoiceImportRoutes.js";
import { analyticsRoutes } from "./routes/analyticsRoutes.js";
import { crmRoutes } from "./routes/crmRoutes.js";
import { runDailyVendusConsumptionJob } from "./services/dailyVendusConsumptionJobService.js";
import { populateAuth, requireAuth, requireMinRole } from "./middleware/auth.js";
import { authRoutes } from "./routes/authRoutes.js";

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

// Vendus: instanciado antes do cash-closings para injectar o gateway de sessões
const vendusModule = createVendusModule({
  eatzPaymentId: ENV.VENDUS_EATZ_PAYMENT_ID,
  appsPaymentId: ENV.VENDUS_APPS_PAYMENT_ID,
  salaoPriceGroupId: ENV.VENDUS_PRICE_GROUP_SALAO,
  eatzPriceGroupId: ENV.VENDUS_PRICE_GROUP_EATZ,
  concurrency: ENV.CONCURRENCY,
  historyStartYear: ENV.ANALYTICS_HISTORY_START_YEAR,
});

// Air Menu: instanciado antes do cash-closings para injectar getSummary
const airMenuModule = createAirMenuModule({
  apiKey: ENV.AIRMENU_API_KEY,
  username: ENV.AIRMENU_USERNAME,
  password: ENV.AIRMENU_PASSWORD,
  enterprises: ENV.AIRMENU_ENTERPRISES,
  webhookSecret: ENV.AIRMENU_WEBHOOK_SECRET,
});

// Air Menu public routes (webhook receiver + SSE stream) — no auth required
app.use("/api", airMenuModule.publicRouter);

// Cash closing module (hexagonal) — recebe gateway Vendus e getSummary do air-menu
const cashClosingsModule = createCashClosingsModule(vendusModule.gateway, airMenuModule.getSummary);

// Cash closing public routes (PIN verify + submit) — no auth required
app.use("/api", cashClosingsModule.publicRouter);

// KDS — public (kitchen screen, no login needed)
// Recebe o eventBus do air-menu para emitir pedidos AirMenu via SSE em tempo real
const kdsModule = createKdsModule({ eventBus: airMenuModule.eventBus });
app.use("/api", kdsModule.router);

// All routes below this line require authentication
app.use(requireAuth);

// Admin-only: user management
app.use("/api/auth", requireMinRole("admin"), authRoutes);

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
        void runDailyVendusConsumptionJob({})
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
