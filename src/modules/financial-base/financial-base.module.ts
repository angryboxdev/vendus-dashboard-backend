import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/supabaseClient.js";
import type { CreateSupplierPort } from "./domain/ports/in/supplier.ports.js";

import { SupabaseCostCenterGroupRepository } from "./adapters/out/supabase-cost-center-group.repository.js";
import { SupabaseCostCenterCategoryRepository } from "./adapters/out/supabase-cost-center-category.repository.js";
import { SupabaseSupplierRepository } from "./adapters/out/supabase-supplier.repository.js";
import { SupabaseSupplierInvoiceStatsAdapter } from "./adapters/out/supabase-supplier-invoice-stats.adapter.js";
import { SupabaseChannelRepository } from "./adapters/out/supabase-channel.repository.js";

import { ListCostCenterGroupsUseCase } from "./application/use-cases/list-cost-center-groups.use-case.js";
import { GetCostCenterGroupUseCase } from "./application/use-cases/get-cost-center-group.use-case.js";
import { CreateCostCenterGroupUseCase } from "./application/use-cases/create-cost-center-group.use-case.js";
import { UpdateCostCenterGroupUseCase } from "./application/use-cases/update-cost-center-group.use-case.js";
import { ToggleCostCenterGroupStatusUseCase } from "./application/use-cases/toggle-cost-center-group-status.use-case.js";

import { ListCostCenterCategoriesUseCase } from "./application/use-cases/list-cost-center-categories.use-case.js";
import { GetCostCenterCategoryUseCase } from "./application/use-cases/get-cost-center-category.use-case.js";
import { CreateCostCenterCategoryUseCase } from "./application/use-cases/create-cost-center-category.use-case.js";
import { UpdateCostCenterCategoryUseCase } from "./application/use-cases/update-cost-center-category.use-case.js";
import { ToggleCostCenterCategoryStatusUseCase } from "./application/use-cases/toggle-cost-center-category-status.use-case.js";
import { SeedDefaultCostCentersUseCase } from "./application/use-cases/seed-default-cost-centers.use-case.js";

import { CreateSupplierUseCase } from "./application/use-cases/create-supplier.use-case.js";
import { UpdateSupplierUseCase } from "./application/use-cases/update-supplier.use-case.js";
import { ToggleSupplierStatusUseCase } from "./application/use-cases/toggle-supplier-status.use-case.js";
import { ListSuppliersUseCase } from "./application/use-cases/list-suppliers.use-case.js";
import { GetSupplierUseCase } from "./application/use-cases/get-supplier.use-case.js";
import { ListSuppliersWithStatsUseCase } from "./application/use-cases/list-suppliers-with-stats.use-case.js";
import { GetSuppliersKpisUseCase } from "./application/use-cases/get-suppliers-kpis.use-case.js";
import { GetSupplierDetailUseCase } from "./application/use-cases/get-supplier-detail.use-case.js";
import { GetSupplierStatementUseCase } from "./application/use-cases/get-supplier-statement.use-case.js";
import { ListChannelsUseCase } from "./application/use-cases/list-channels.use-case.js";

import { FinancialBaseController } from "./adapters/in/financial-base.controller.js";

/**
 * Composition root do módulo financial-base.
 *
 * Único lugar que conhece as implementações concretas dos adapters.
 * Use cases e domínio apenas conhecem interfaces (ports).
 */
export function createFinancialBaseModule(): { router: Router; createSupplier: CreateSupplierPort } {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");

  // Adapters de saída
  const groupRepository = new SupabaseCostCenterGroupRepository(supabase);
  const categoryRepository = new SupabaseCostCenterCategoryRepository(supabase);
  const supplierRepository = new SupabaseSupplierRepository(supabase);
  const supplierInvoiceStats = new SupabaseSupplierInvoiceStatsAdapter(supabase);
  const channelRepository = new SupabaseChannelRepository(supabase);

  // Use cases — grupos de centros de custo
  const listCostCenterGroups = new ListCostCenterGroupsUseCase(groupRepository);
  const getCostCenterGroup = new GetCostCenterGroupUseCase(groupRepository);
  const createCostCenterGroup = new CreateCostCenterGroupUseCase(groupRepository);
  const updateCostCenterGroup = new UpdateCostCenterGroupUseCase(groupRepository);
  const toggleCostCenterGroupStatus = new ToggleCostCenterGroupStatusUseCase(groupRepository);

  // Use cases — subcategorias de centros de custo
  const listCostCenterCategories = new ListCostCenterCategoriesUseCase(categoryRepository);
  const getCostCenterCategory = new GetCostCenterCategoryUseCase(categoryRepository);
  const createCostCenterCategory = new CreateCostCenterCategoryUseCase(
    groupRepository,
    categoryRepository,
  );
  const updateCostCenterCategory = new UpdateCostCenterCategoryUseCase(categoryRepository);
  const toggleCostCenterCategoryStatus = new ToggleCostCenterCategoryStatusUseCase(
    categoryRepository,
  );
  const seedDefaultCostCenters = new SeedDefaultCostCentersUseCase(
    groupRepository,
    categoryRepository,
  );

  // Use cases — canais
  const listChannels = new ListChannelsUseCase(channelRepository);

  // Use cases — fornecedores
  const createSupplier = new CreateSupplierUseCase(supplierRepository);
  const updateSupplier = new UpdateSupplierUseCase(supplierRepository);
  const toggleSupplierStatus = new ToggleSupplierStatusUseCase(supplierRepository);
  const listSuppliers = new ListSuppliersUseCase(supplierRepository);
  const getSupplier = new GetSupplierUseCase(supplierRepository);
  const listSuppliersWithStats = new ListSuppliersWithStatsUseCase(
    supplierRepository,
    supplierInvoiceStats,
  );
  const getSuppliersKpis = new GetSuppliersKpisUseCase(supplierRepository, supplierInvoiceStats);
  const getSupplierDetail = new GetSupplierDetailUseCase(supplierRepository, supplierInvoiceStats);
  const getSupplierStatement = new GetSupplierStatementUseCase(supplierRepository, supplierInvoiceStats);

  // Adapter de entrada (HTTP)
  const controller = new FinancialBaseController(
    listCostCenterGroups,
    getCostCenterGroup,
    createCostCenterGroup,
    updateCostCenterGroup,
    toggleCostCenterGroupStatus,
    listCostCenterCategories,
    getCostCenterCategory,
    createCostCenterCategory,
    updateCostCenterCategory,
    toggleCostCenterCategoryStatus,
    seedDefaultCostCenters,
    createSupplier,
    updateSupplier,
    toggleSupplierStatus,
    listSuppliers,
    getSupplier,
    listSuppliersWithStats,
    getSuppliersKpis,
    getSupplierDetail,
    getSupplierStatement,
    listChannels,
  );

  return { router: controller.router, createSupplier };
}
