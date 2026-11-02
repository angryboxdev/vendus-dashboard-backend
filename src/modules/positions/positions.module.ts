import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { PositionsController } from "./adapters/in/positions.controller.js";
import { SupabasePositionAuditAdapter, SupabasePositionHoldersAdapter } from "./adapters/out/supabase-position-holders.adapter.js";
import { SupabasePositionRepository } from "./adapters/out/supabase-position.repository.js";
import { CreatePositionUseCase, ListPositionsUseCase, SetPositionActiveUseCase, UpdatePositionUseCase } from "./application/use-cases/positions.use-cases.js";

/**
 * Composition root dos Cargos (Configurações → Estrutura → Cargos). Saiu do
 * módulo `hr` antigo quando este foi retirado (ADR-0040, fase 4); mesmo
 * contrato em `/api/novo-rh/positions`.
 */
export function createPositionsModule(): { router: Router } {
  const positions = new SupabasePositionRepository(createScopedQuery);
  const holders = new SupabasePositionHoldersAdapter(createScopedQuery);
  const audit = new SupabasePositionAuditAdapter(createScopedQuery);
  const controller = new PositionsController(
    new ListPositionsUseCase(positions, holders),
    new CreatePositionUseCase(positions, audit),
    new UpdatePositionUseCase(positions, holders, audit),
    new SetPositionActiveUseCase(positions, holders, audit),
  );
  return { router: controller.router };
}
