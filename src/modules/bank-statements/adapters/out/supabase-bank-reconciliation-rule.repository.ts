import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import {
  BankReconciliationRule,
} from "../../domain/entities/bank-reconciliation-rule.js";
import type { JustificationType, MovementType, RiskLevel } from "../../domain/entities/bank-movement.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";

function toEntity(row: Record<string, unknown>): BankReconciliationRule {
  return BankReconciliationRule.reconstitute({
    id: row.id as string,
    name: row.name as string,
    descriptionContains: row.description_contains as string,
    movementType: (row.movement_type as MovementType | null) ?? null,
    costCenterGroupId: (row.cost_center_group_id as string | null) ?? null,
    costCenterCategoryId: (row.cost_center_category_id as string | null) ?? null,
    justificationType: row.justification_type as JustificationType,
    requiresDocument: row.requires_document as boolean,
    affectsDre: row.affects_dre as boolean,
    affectsCashflow: row.affects_cashflow as boolean,
    affectsProfitability: row.affects_profitability as boolean,
    riskLevel: row.risk_level as RiskLevel,
    isActive: row.is_active as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export class SupabaseBankReconciliationRuleRepository
  implements BankReconciliationRuleRepositoryPort
{
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(organizationId: OrganizationId, rule: BankReconciliationRule): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("bank_reconciliation_rules").insert({
      id: rule.id,
      name: rule.name,
      description_contains: rule.descriptionContains,
      movement_type: rule.movementType,
      cost_center_group_id: rule.costCenterGroupId,
      cost_center_category_id: rule.costCenterCategoryId,
      justification_type: rule.justificationType,
      requires_document: rule.requiresDocument,
      affects_dre: rule.affectsDre,
      affects_cashflow: rule.affectsCashflow,
      affects_profitability: rule.affectsProfitability,
      risk_level: rule.riskLevel,
      is_active: rule.isActive,
      created_at: rule.createdAt.toISOString(),
      updated_at: rule.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findAll(organizationId: OrganizationId, activeOnly = false): Promise<BankReconciliationRule[]> {
    let q = this.scopedQuery(organizationId)
      .table("bank_reconciliation_rules")
      .select("*")
      .order("name", { ascending: true });
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as unknown as Record<string, unknown>));
  }

  async findById(organizationId: OrganizationId, id: string): Promise<BankReconciliationRule | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_reconciliation_rules")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async update(organizationId: OrganizationId, rule: BankReconciliationRule): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("bank_reconciliation_rules")
      .update({
        name: rule.name,
        description_contains: rule.descriptionContains,
        movement_type: rule.movementType,
        cost_center_group_id: rule.costCenterGroupId,
        cost_center_category_id: rule.costCenterCategoryId,
        justification_type: rule.justificationType,
        requires_document: rule.requiresDocument,
        affects_dre: rule.affectsDre,
        affects_cashflow: rule.affectsCashflow,
        affects_profitability: rule.affectsProfitability,
        risk_level: rule.riskLevel,
        is_active: rule.isActive,
        updated_at: rule.updatedAt.toISOString(),
      })
      .eq("id", rule.id);
    if (error) throw new Error(error.message);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("bank_reconciliation_rules")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}
