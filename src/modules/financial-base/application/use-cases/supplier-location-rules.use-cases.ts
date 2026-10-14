import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { DEFAULT_STOCK_POLICIES } from "../../domain/entities/supplier.js";
import type { SupplierLocationRule } from "../../domain/entities/supplier-location-rule.js";
import { InvalidDefaultStockPolicyError, InvalidSupplierDefaultsError, SupplierNotFoundError } from "../../domain/errors.js";
import type { SupplierLocationRuleDTO, SupplierLocationRulesPort, UpsertSupplierLocationRuleCommand } from "../../domain/ports/in/supplier-location-rules.ports.js";
import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";
import type { SupplierLocationRuleRepositoryPort } from "../../domain/ports/out/supplier-location-rule-repository.port.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import { assertSupplierDefaults } from "./shared-supplier-defaults.js";

const toDTO = (r: SupplierLocationRule): SupplierLocationRuleDTO => ({
  id: r.id,
  supplierId: r.supplierId,
  locationId: r.locationId,
  stockPolicy: r.stockPolicy,
  costCenterGroupId: r.costCenterGroupId,
  costCenterCategoryId: r.costCenterCategoryId,
  updatedAt: r.updatedAt.toISOString(),
});

export class SupplierLocationRulesUseCases implements SupplierLocationRulesPort {
  constructor(
    private readonly suppliers: SupplierRepositoryPort,
    private readonly rules: SupplierLocationRuleRepositoryPort,
    private readonly categories: CostCenterCategoryRepositoryPort,
    private readonly locations: LocationReadPort,
  ) {}

  async list(organizationId: OrganizationId, supplierId: string): Promise<SupplierLocationRuleDTO[]> {
    return (await this.rules.listBySupplier(organizationId, supplierId)).map(toDTO);
  }

  async upsert(c: UpsertSupplierLocationRuleCommand): Promise<SupplierLocationRuleDTO> {
    if (!(await this.suppliers.findById(c.organizationId, c.supplierId))) throw new SupplierNotFoundError(c.supplierId);
    if (c.stockPolicy != null && !DEFAULT_STOCK_POLICIES.includes(c.stockPolicy)) throw new InvalidDefaultStockPolicyError(c.stockPolicy);
    if (c.stockPolicy == null && !c.costCenterCategoryId) {
      throw new InvalidSupplierDefaultsError("Uma exceção por loja precisa de política de Stock ou de centro de custo.");
    }
    await assertSupplierDefaults(this.categories, this.locations, c.organizationId, {
      costCenterGroupId: c.costCenterGroupId ?? null,
      costCenterCategoryId: c.costCenterCategoryId ?? null,
      locationId: c.locationId,
    });
    const now = new Date();
    const saved = await this.rules.upsert(c.organizationId, {
      id: crypto.randomUUID(),
      supplierId: c.supplierId,
      locationId: c.locationId,
      stockPolicy: c.stockPolicy ?? null,
      costCenterGroupId: c.costCenterGroupId ?? null,
      costCenterCategoryId: c.costCenterCategoryId ?? null,
      createdBy: c.actor,
      createdAt: now,
      updatedAt: now,
    });
    return toDTO(saved);
  }

  async remove(organizationId: OrganizationId, supplierId: string, locationId: string): Promise<void> {
    await this.rules.delete(organizationId, supplierId, locationId);
  }
}
