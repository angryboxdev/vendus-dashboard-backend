import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import type { DescribeMovementPort } from "../bank-statements/domain/ports/in/describe-movement.port.js";

import { SupabaseBankMovementReadAdapter } from "./adapters/out/supabase-bank-movement-read.adapter.js";
import { SupabaseExpenseSourceReadAdapter } from "./adapters/out/supabase-expense-source-read.adapter.js";
import { SupabaseCostCenterCatalogReadAdapter } from "./adapters/out/supabase-cost-center-catalog-read.adapter.js";
import { BankStatementsMovementKindAdapter } from "./adapters/out/bank-statements-movement-kind.adapter.js";
import { GetCashFlowUseCase } from "./application/use-cases/get-cash-flow.use-case.js";
import { CashFlowController } from "./adapters/in/cash-flow.controller.js";

export interface CashFlowModule {
  router: Router;
}

/**
 * Composition root do módulo cash-flow — «Fluxo de caixa» do Mapa de rentabilidade, só a partir do
 * banco. Instanciado em `server.ts` DEPOIS de `bank-statements`, para receber a sua porta de entrada
 * (D10) com o tipo genérico dos movimentos. As tabelas do banco, das faturas e dos centros de custo
 * são só lidas (nunca escritas) pelos adapters daqui.
 */
export function createCashFlowModule(describeMovement: DescribeMovementPort): CashFlowModule {
  const getCashFlow = new GetCashFlowUseCase(
    new SupabaseBankMovementReadAdapter(createScopedQuery),
    new SupabaseExpenseSourceReadAdapter(createScopedQuery),
    new SupabaseCostCenterCatalogReadAdapter(createScopedQuery),
    new BankStatementsMovementKindAdapter(describeMovement),
  );
  return { router: new CashFlowController(getCashFlow).router };
}
