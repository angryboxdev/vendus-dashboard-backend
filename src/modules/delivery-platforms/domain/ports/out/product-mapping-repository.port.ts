import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ProductMapping } from "../../entities/food-cost.js";

/** Mapeamentos gravados dos produtos do delivery (e dos artigos da embalagem). */
export interface ProductMappingRepositoryPort {
  list(organizationId: OrganizationId): Promise<ProductMapping[]>;
  /** Grava (substitui) os mapeamentos das chaves dadas. */
  save(organizationId: OrganizationId, mappings: ProductMapping[], updatedBy: string | null): Promise<void>;
  /** Apaga os mapeamentos destas chaves (voltam à sugestão automática). */
  remove(organizationId: OrganizationId, productKeys: string[]): Promise<void>;
}
