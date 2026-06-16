import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/supabaseClient.js";

import { SupabaseCostCenterRepository } from "./adapters/out/supabase-cost-center.repository.js";
import { SupabaseSupplierRepository } from "./adapters/out/supabase-supplier.repository.js";

import { CreateCostCenterUseCase } from "./application/use-cases/create-cost-center.use-case.js";
import { UpdateCostCenterUseCase } from "./application/use-cases/update-cost-center.use-case.js";
import { ToggleCostCenterStatusUseCase } from "./application/use-cases/toggle-cost-center-status.use-case.js";
import { ListCostCentersUseCase } from "./application/use-cases/list-cost-centers.use-case.js";
import { GetCostCenterUseCase } from "./application/use-cases/get-cost-center.use-case.js";

import { CreateSupplierUseCase } from "./application/use-cases/create-supplier.use-case.js";
import { UpdateSupplierUseCase } from "./application/use-cases/update-supplier.use-case.js";
import { ToggleSupplierStatusUseCase } from "./application/use-cases/toggle-supplier-status.use-case.js";
import { ListSuppliersUseCase } from "./application/use-cases/list-suppliers.use-case.js";
import { GetSupplierUseCase } from "./application/use-cases/get-supplier.use-case.js";

import { FinancialBaseController } from "./adapters/in/financial-base.controller.js";

/**
 * Composition root do módulo financial-base.
 *
 * Único lugar que conhece as implementações concretas dos adapters.
 * Use cases e domínio apenas conhecem interfaces (ports).
 */
export function createFinancialBaseModule(): { router: Router } {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");

  // Adapters de saída
  const costCenterRepository = new SupabaseCostCenterRepository(supabase);
  const supplierRepository = new SupabaseSupplierRepository(supabase);

  // Use cases — centros de custo
  const createCostCenter = new CreateCostCenterUseCase(costCenterRepository);
  const updateCostCenter = new UpdateCostCenterUseCase(costCenterRepository);
  const toggleCostCenterStatus = new ToggleCostCenterStatusUseCase(costCenterRepository);
  const listCostCenters = new ListCostCentersUseCase(costCenterRepository);
  const getCostCenter = new GetCostCenterUseCase(costCenterRepository);

  // Use cases — fornecedores
  const createSupplier = new CreateSupplierUseCase(supplierRepository);
  const updateSupplier = new UpdateSupplierUseCase(supplierRepository);
  const toggleSupplierStatus = new ToggleSupplierStatusUseCase(supplierRepository);
  const listSuppliers = new ListSuppliersUseCase(supplierRepository);
  const getSupplier = new GetSupplierUseCase(supplierRepository);

  // Adapter de entrada (HTTP)
  const controller = new FinancialBaseController(
    createCostCenter,
    updateCostCenter,
    toggleCostCenterStatus,
    listCostCenters,
    getCostCenter,
    createSupplier,
    updateSupplier,
    toggleSupplierStatus,
    listSuppliers,
    getSupplier,
  );

  return { router: controller.router };
}
