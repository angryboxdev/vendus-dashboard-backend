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
    descriptionPattern: (row.description_pattern as string | null) ?? null,
    channelId: (row.channel_id as string | null) ?? null,
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
      .is("description_pattern", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findBySupplierIdAndDescription(supplierId: string, description?: string): Promise<ClassificationRule | null> {
    const { data, error } = await this.supabase
      .from("classification_rules")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return null;

    const rules = (data as Record<string, unknown>[]).map(toEntity);

    if (description) {
      const desc = description.toLowerCase();
      const specific = rules
        .filter((r) => r.descriptionPattern !== null && desc.includes(r.descriptionPattern.toLowerCase()))
        .sort((a, b) => (b.descriptionPattern?.length ?? 0) - (a.descriptionPattern?.length ?? 0));
      if (specific.length > 0) return specific[0]!;
    }

    return rules.find((r) => r.descriptionPattern === null) ?? null;
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
      description_pattern: rule.descriptionPattern,
      channel_id: rule.channelId,
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
        description_pattern: rule.descriptionPattern,
        channel_id: rule.channelId,
        updated_at: rule.updatedAt.toISOString(),
      })
      .eq("id", rule.id);
    if (error) throw new Error(error.message);
  }
}
