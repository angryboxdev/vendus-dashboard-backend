import type { ClassificationRule } from "../../entities/classification-rule.js";

export interface ClassificationRuleRepositoryPort {
  findBySupplierId(supplierId: string): Promise<ClassificationRule | null>;
  /** Devolve a regra mais específica para (supplier + descrição da linha).
   * Prioridade: 1º padrão que contenha a descrição (mais longo primeiro), 2º regra genérica (sem padrão). */
  findBySupplierIdAndDescription(supplierId: string, description?: string): Promise<ClassificationRule | null>;
  save(rule: ClassificationRule): Promise<void>;
  update(rule: ClassificationRule): Promise<void>;
}
