/**
 * Ajuste de stock a partir de um JSON de linhas (reference/title + qty):
 * mesmo cálculo de consumo por receitas que o painel.
 *
 * Uso:
 *   STOCK_ADJUSTMENT_LINES_FILE=./docs/stock-adjustment-lines.example.json ADJUSTMENT_DATE=2026-03-21 npx tsx src/jobs/runStockAdjustmentFromLines.ts
 *   CRON_DRY_RUN=1 ...
 *   ADJUSTMENT_BATCH=contagem-marco  (opcional: vários lotes no mesmo dia)
 *   ADJUSTMENT_REASON_NOTE="contagem física 21"  (opcional: texto no reason)
 *
 * Compat: EXCLUDED_SALES_FILE ainda funciona (alias do ficheiro de linhas).
 */
import fs from "node:fs";
import path from "node:path";
import "../config/env.js";
import {
  runStockAdjustmentFromLines,
  type StockAdjustmentLine,
} from "../services/stockAdjustmentFromLinesService.js";
import { UNATTENDED_SCOPE } from "../infra/scoped-db/unattended-scope.js";

const file =
  process.env.STOCK_ADJUSTMENT_LINES_FILE?.trim() ||
  process.env.EXCLUDED_SALES_FILE?.trim();
const adjustmentDate = process.env.ADJUSTMENT_DATE?.trim();
const dryRun =
  process.env.CRON_DRY_RUN === "1" || process.env.CRON_DRY_RUN === "true";
const batchLabel = process.env.ADJUSTMENT_BATCH?.trim();
const reasonNote = process.env.ADJUSTMENT_REASON_NOTE?.trim();

if (!file) {
  console.error(
    "Define STOCK_ADJUSTMENT_LINES_FILE=caminho/para/lista.json (ou EXCLUDED_SALES_FILE)"
  );
  process.exit(1);
}
if (!adjustmentDate) {
  console.error(
    "Define ADJUSTMENT_DATE=YYYY-MM-DD (dia civil a registar no movement_date)"
  );
  process.exit(1);
}

const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
const raw = fs.readFileSync(abs, "utf8");
const lines = JSON.parse(raw) as StockAdjustmentLine[];
if (!Array.isArray(lines)) {
  console.error("O ficheiro deve ser um array JSON de { reference?, title?, qty }");
  process.exit(1);
}

const runOpts: Parameters<typeof runStockAdjustmentFromLines>[1] = {
  lines,
  adjustmentDate,
  dryRun,
};
if (batchLabel) runOpts.batchLabel = batchLabel;
if (reasonNote) runOpts.reasonNote = reasonNote;

runStockAdjustmentFromLines(UNATTENDED_SCOPE.organizationId, runOpts)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
