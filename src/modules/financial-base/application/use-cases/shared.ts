import type { CostCenterGroup } from "../../domain/entities/cost-center-group.js";
import type { CostCenterCategory } from "../../domain/entities/cost-center-category.js";
import type { Supplier } from "../../domain/entities/supplier.js";
import type { CostCenterGroupDTO } from "../../domain/ports/in/cost-center-group.ports.js";
import type { CostCenterCategoryDTO } from "../../domain/ports/in/cost-center-category.ports.js";
import type { SupplierDTO } from "../../domain/ports/in/supplier.ports.js";

export function toCostCenterGroupDTO(g: CostCenterGroup): CostCenterGroupDTO {
  return {
    id: g.id,
    code: g.code,
    name: g.name,
    description: g.description,
    sortOrder: g.sortOrder,
    isActive: g.isActive,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export function toCostCenterCategoryDTO(c: CostCenterCategory): CostCenterCategoryDTO {
  return {
    id: c.id,
    groupId: c.groupId,
    code: c.code,
    name: c.name,
    financialType: c.financialType,
    affectsDre: c.affectsDre,
    affectsCashflow: c.affectsCashflow,
    affectsProfitability: c.affectsProfitability,
    requiresChannel: c.requiresChannel,
    requiresAllocation: c.requiresAllocation,
    isActive: c.isActive,
    description: c.description,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function toSupplierDTO(s: Supplier): SupplierDTO {
  return {
    id: s.id,
    name: s.name,
    nif: s.nif,
    email: s.email,
    phone: s.phone,
    address: s.address,
    iban: s.iban,
    defaultCostCenterGroupId: s.defaultCostCenterGroupId,
    defaultCostCenterCategoryId: s.defaultCostCenterCategoryId,
    paymentTermsDays: s.paymentTermsDays,
    notes: s.notes,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
