import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvalidSupplierDefaultsError } from "../../domain/errors.js";
import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";

/**
 * Valida predefinições do fornecedor (F2 v1.2 §2.1): a subcategoria pertence
 * ao grupo indicado e está ativa; o destino é uma loja concreta e ativa da
 * organização («todas as lojas» nunca é destino de uma quantidade).
 */
export async function assertSupplierDefaults(
  categories: CostCenterCategoryRepositoryPort,
  locations: LocationReadPort,
  organizationId: OrganizationId,
  d: { costCenterGroupId?: string | null | undefined; costCenterCategoryId?: string | null | undefined; locationId?: string | null | undefined },
): Promise<void> {
  if (d.costCenterCategoryId) {
    const cat = await categories.findById(organizationId, d.costCenterCategoryId);
    if (!cat) throw new InvalidSupplierDefaultsError("A subcategoria de centro de custo não existe.");
    if (!cat.isActive) throw new InvalidSupplierDefaultsError(`A subcategoria «${cat.name}» está inativa.`);
    if (d.costCenterGroupId && cat.groupId !== d.costCenterGroupId) {
      throw new InvalidSupplierDefaultsError(`A subcategoria «${cat.name}» não pertence ao grupo indicado.`);
    }
  }
  if (d.locationId) {
    const loc = await locations.findById(organizationId, d.locationId);
    if (!loc) throw new InvalidSupplierDefaultsError("A loja indicada não existe nesta organização.");
    if (!loc.isActive) throw new InvalidSupplierDefaultsError(`A loja «${loc.name}» está inativa.`);
  }
}
