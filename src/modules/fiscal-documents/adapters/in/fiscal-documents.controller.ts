import { Router } from "express";
import type { FiscalDocumentsPort, HistoricalDocumentsSourcePort } from "../../domain/ports/in/fiscal-documents.ports.js";

/**
 * `POST /api/fiscal-documents/backfill` — migração do histórico com simulação
 * (`dryRun` por omissão true): relatório de identidades a registar,
 * duplicados históricos e identidades incompletas. Nada é fundido nem apagado.
 */
export function createFiscalDocumentsRouter(port: FiscalDocumentsPort, history: HistoricalDocumentsSourcePort): Router {
  const r = Router();
  r.post("/fiscal-documents/backfill", async (req, res) => {
    const dryRun = (req.body as { dryRun?: unknown } | undefined)?.dryRun !== false;
    const docs = await history.list(req.auth!.orgId);
    res.json(await port.backfill(req.auth!.orgId, req.auth!.email || req.auth!.sub, docs, dryRun));
  });
  return r;
}
