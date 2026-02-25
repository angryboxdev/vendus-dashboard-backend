import { ENV } from "./config/env.js";
import cors from "cors";
import { documentsRoutes } from "./routes/documentsRoutes.js";
import { dreRoutes } from "./routes/dreRoutes.js";
import express from "express";
import { reportsRoutes } from "./routes/reportsRoutes.js";
import { stockRoutes } from "./routes/stockRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api", documentsRoutes);
app.use("/api", reportsRoutes);
app.use("/api", dreRoutes);
app.use("/api", stockRoutes);

app.listen(ENV.PORT, () => {
  console.log(`Backend running on http://localhost:${ENV.PORT}`);
});
