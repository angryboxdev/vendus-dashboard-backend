import { ENV } from "./config/env.js";
import cors from "cors";
import { documentsRoutes } from "./routes/documentsRoutes.js";
import { dreRoutes } from "./routes/dreRoutes.js";
import express from "express";
import { internalCronRoutes } from "./routes/internalCronRoutes.js";
import { pizzaRoutes } from "./routes/pizzaRoutes.js";
import { reportsRoutes } from "./routes/reportsRoutes.js";
import { stockRoutes } from "./routes/stockRoutes.js";
import { runDailyVendusConsumptionJob } from "./services/dailyVendusConsumptionJobService.js";

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

app.use("/api", documentsRoutes);
app.use("/api", reportsRoutes);
app.use("/api", dreRoutes);
app.use("/api", stockRoutes);
app.use("/api", pizzaRoutes);

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
