import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ClassificationRule } from "../../entities/classification-rule.js";

export interface ClassificationRuleRepositoryPort {
  findBySupplierId(organizationId: OrganizationId, supplierId: string): Promise<ClassificationRule | null>;
  /** Devolve a regra mais específica para (supplier + descrição da linha).
   * Prioridade: 1º padrão que contenha a descrição (mais longo primeiro), 2º regra genérica (sem padrão). */
  findBySupplierIdAndDescription(
    organizationId: OrganizationId,
    supplierId: string,
    description?: string,
  ): Promise<ClassificationRule | null>;
  save(organizationId: OrganizationId, rule: ClassificationRule): Promise<void>;
  update(organizationId: OrganizationId, rule: ClassificationRule): Promise<void>;
}
