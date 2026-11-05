import type { Router } from "express";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import { createScopedQuery, type ScopedQueryFactory } from "../../infra/scoped-db/scoped-query.js";
import { createPosRouter } from "./adapters/in/pos.controller.js";
import { InvoicingGateway, type InvoicingFunctions } from "./adapters/out/invoicing-gateway.js";
import { KioskPinEmployees } from "./adapters/out/kiosk-pin-employees.js";
import { LisbonDayClock } from "./adapters/out/lisbon-day-clock.js";
import { SupabasePosStore } from "./adapters/out/supabase-pos-store.js";
import { PosUseCases } from "./application/use-cases/pos.use-cases.js";

/**
 * Composition root do POS do Mezza (fase 1). Isolado: não toca Vendus,
 * AirMenu, DRE nem a Gestão de Stock. Os documentos fiscais vêm do módulo
 * `invoicing` por funções ligadas no server.ts; o PIN é o do quiosque de ponto.
 */
export function createPosModule(deps: { invoicing: InvoicingFunctions; hashPin: (pin: string) => string; scoped?: ScopedQueryFactory }): { router: Router; pos: PosUseCases } {
  const scoped = deps.scoped ?? createScopedQuery;
  const pos = new PosUseCases({
    store: new SupabasePosStore(scoped),
    invoicing: new InvoicingGateway(deps.invoicing),
    employees: new KioskPinEmployees(scoped, deps.hashPin),
    clock: new LisbonDayClock(),
  });
  return { router: createPosRouter(pos, new SupabaseIdempotencyStore(scoped)), pos };
}
