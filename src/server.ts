import { ENV } from "./config/env.js";
import cors from "cors";
import { documentsRoutes } from "./routes/documentsRoutes.js";
import { dreRoutes } from "./routes/dreRoutes.js";
import express from "express";
import { internalCronRoutes } from "./routes/internalCronRoutes.js";
import { pizzaRoutes } from "./routes/pizzaRoutes.js";
import { preparationRoutes } from "./routes/preparationRoutes.js";
import { reportsRoutes } from "./routes/reportsRoutes.js";
import { stockRoutes } from "./routes/stockRoutes.js";
import { hrRoutes } from "./routes/hrRoutes.js";
import { hrKioskRoutes } from "./routes/hrKioskRoutes.js";
import { hrAuditRoutes } from "./routes/hrAuditRoutes.js";
import { hrLeaveRoutes } from "./routes/hrLeaveRoutes.js";
import { cashClosingPublicRoutes, cashClosingRoutes } from "./routes/cashClosingRoutes.js";
import { supplierInvoiceImportRoutes } from "./routes/supplierInvoiceImportRoutes.js";
import { analyticsRoutes } from "./routes/analyticsRoutes.js";
import { crmRoutes } from "./routes/crmRoutes.js";
import { uberEatsRoutes } from "./routes/uberEatsRoutes.js";
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

// Uber Eats webhook usa raw body para verificação HMAC — deve ficar ANTES de express.json()
app.use("/api/uber-eats", uberEatsRoutes);

app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// populateAuth runs for ALL routes (populates req.auth from Bearer token if present)
app.use(populateAuth);

// Kiosk routes registered BEFORE global requireAuth:
// GET /kiosk/daily-token and POST /kiosk/scan are public
// PATCH /employees/:id/kiosk-pin has inline requireAuth inside the handler
app.use("/api/hr", hrKioskRoutes);

// Cash closing public routes (PIN verify + submit) — no auth required
app.use("/api", cashClosingPublicRoutes);

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

// Cash closing manager routes (authenticated)
app.use("/api", requireMinRole("manager"), cashClosingRoutes);

if (ENV.CRON_SECRET) {
  app.use("/api", internalCronRoutes);
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
