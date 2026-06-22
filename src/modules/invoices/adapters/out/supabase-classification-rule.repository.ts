import type { SupabaseClient } from "@supabase/supabase-js";
import { ClassificationRule } from "../../domain/entities/classification-rule.js";
import type { InvoiceLineType } from "../../domain/entities/invoice.js";
import type { ClassificationRuleRepositoryPort } from "../../domain/ports/out/classification-rule-repository.port.js";

function toEntity(row: Record<string, unknown>): ClassificationRule {
  return ClassificationRule.reconstitute({
    id: row.id as string,
    supplierId: row.supplier_id as string,
    defaultCostCenterId: (row.default_cost_center_id as string | null) ?? null,
    defaultCostCenterCategoryId: (row.default_cost_center_category_id as string | null) ?? null,
    defaultLineType: (row.default_line_type as InvoiceLineType | null) ?? null,
    defaultCategory: (row.default_category as string | null) ?? null,
    confidenceBoost: row.confidence_boost as number,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export class SupabaseClassificationRuleRepository implements ClassificationRuleRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findBySupplierId(supplierId: string): Promise<ClassificationRule | null> {
    const { data, error } = await this.supabase
      .from("classification_rules")
      .select("*")
      .eq("supplier_id", supplierId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async save(rule: ClassificationRule): Promise<void> {
    const { error } = await this.supabase.from("classification_rules").insert({
      id: rule.id,
      supplier_id: rule.supplierId,
      default_cost_center_id: rule.defaultCostCenterId,
      default_cost_center_category_id: rule.defaultCostCenterCategoryId,
      default_line_type: rule.defaultLineType,
      default_category: rule.defaultCategory,
      confidence_boost: rule.confidenceBoost,
      created_at: rule.createdAt.toISOString(),
      updated_at: rule.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async update(rule: ClassificationRule): Promise<void> {
    const { error } = await this.supabase
      .from("classification_rules")
      .update({
        default_cost_center_id: rule.defaultCostCenterId,
        default_cost_center_category_id: rule.defaultCostCenterCategoryId,
        default_line_type: rule.defaultLineType,
        default_category: rule.defaultCategory,
        confidence_boost: rule.confidenceBoost,
        updated_at: rule.updatedAt.toISOString(),
      })
      .eq("id", rule.id);
    if (error) throw new Error(error.message);
  }
}
