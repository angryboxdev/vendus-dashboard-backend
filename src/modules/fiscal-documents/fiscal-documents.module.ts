import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createFiscalDocumentsRouter } from "./adapters/in/fiscal-documents.controller.js";
import { SupabaseFiscalAudit, SupabaseFiscalIdentityRepository } from "./adapters/out/supabase-fiscal-identity.repository.js";
import { FiscalDocumentsUseCases } from "./application/use-cases/fiscal-documents.use-cases.js";
import type { FiscalDocumentsPort, HistoricalDocumentsSourcePort } from "./domain/ports/in/fiscal-documents.ports.js";

/** Composition root da identidade fiscal partilhada (Financeiro + Stock). */
export function createFiscalDocumentsModule(): { fiscalDocuments: FiscalDocumentsPort; routerWith: (history: HistoricalDocumentsSourcePort) => Router } {
  const fiscalDocuments = new FiscalDocumentsUseCases(new SupabaseFiscalIdentityRepository(createScopedQuery), new SupabaseFiscalAudit(createScopedQuery));
  return { fiscalDocuments, routerWith: (history) => createFiscalDocumentsRouter(fiscalDocuments, history) };
}
