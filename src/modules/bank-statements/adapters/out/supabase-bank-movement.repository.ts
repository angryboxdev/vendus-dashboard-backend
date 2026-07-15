import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BankMovement,
  type MovementType,
  type ReconciliationStatus,
  type JustificationType,
  type RiskLevel,
  type MatchedEntityType,
} from "../../domain/entities/bank-movement.js";
import type {
  BankMovementFilter,
  BankMovementRepositoryPort,
} from "../../domain/ports/out/bank-movement-repository.port.js";

function toEntity(row: Record<string, unknown>): BankMovement {
  return BankMovement.reconstitute({
    id: row.id as string,
    statementImportId: row.statement_import_id as string,
    bookingDate: new Date(row.booking_date as string),
    valueDate: new Date(row.value_date as string),
    description: row.description as string,
    amount: row.amount as number,
    balanceAfter: row.balance_after as number,
    currency: row.currency as string,
    movementType: row.movement_type as MovementType,
    reconciliationStatus: row.reconciliation_status as ReconciliationStatus,
    justificationType: (row.justification_type as JustificationType | null) ?? null,
    riskLevel: row.risk_level as RiskLevel,
    requiresDocument: row.requires_document as boolean,
    documentUrl: (row.document_url as string | null) ?? null,
    matchedEntityType: (row.matched_entity_type as MatchedEntityType | null) ?? null,
    matchedEntityId: (row.matched_entity_id as string | null) ?? null,
    confidenceScore: (row.confidence_score as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    deduplicationHash: row.deduplication_hash as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    costCenterGroupId: (row.cost_center_group_id as string | null) ?? null,
    costCenterCategoryId: (row.cost_center_category_id as string | null) ?? null,
    supplierId: (row.supplier_id as string | null) ?? null,
    vatRate: (row.vat_rate as number | null) ?? null,
    vatIncluded: (row.vat_included as boolean | null) ?? null,
  });
}

export class SupabaseBankMovementRepository implements BankMovementRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async saveBulk(movements: BankMovement[]): Promise<void> {
    if (movements.length === 0) return;
    const rows = movements.map((m) => ({
      id: m.id,
      statement_import_id: m.statementImportId,
      booking_date: m.bookingDate.toISOString().slice(0, 10),
      value_date: m.valueDate.toISOString().slice(0, 10),
      description: m.description,
      amount: m.amount,
      balance_after: m.balanceAfter,
      currency: m.currency,
      movement_type: m.movementType,
      reconciliation_status: m.reconciliationStatus,
      justification_type: m.justificationType,
      risk_level: m.riskLevel,
      requires_document: m.requiresDocument,
      document_url: m.documentUrl,
      matched_entity_type: m.matchedEntityType,
      matched_entity_id: m.matchedEntityId,
      confidence_score: m.confidenceScore,
      notes: m.notes,
      deduplication_hash: m.deduplicationHash,
      created_at: m.createdAt.toISOString(),
      updated_at: m.updatedAt.toISOString(),
    }));
    const { error } = await this.supabase.from("bank_movements").insert(rows);
    if (error) throw new Error(error.message);
  }

  async findByStatementId(
    statementImportId: string,
    filter?: BankMovementFilter
  ): Promise<BankMovement[]> {
    let q = this.supabase
      .from("bank_movements")
      .select("*")
      .eq("statement_import_id", statementImportId)
      .order("booking_date", { ascending: true });

    if (filter?.reconciliationStatus)
      q = q.eq("reconciliation_status", filter.reconciliationStatus);
    if (filter?.movementType) q = q.eq("movement_type", filter.movementType);
    if (filter?.riskLevel) q = q.eq("risk_level", filter.riskLevel);
    if (filter?.from) q = q.gte("booking_date", filter.from.toISOString().slice(0, 10));
    if (filter?.to) q = q.lte("booking_date", filter.to.toISOString().slice(0, 10));

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async findById(id: string): Promise<BankMovement | null> {
    const { data, error } = await this.supabase
      .from("bank_movements")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async update(movement: BankMovement): Promise<void> {
    const { error } = await this.supabase
      .from("bank_movements")
      .update({
        reconciliation_status: movement.reconciliationStatus,
        justification_type: movement.justificationType,
        risk_level: movement.riskLevel,
        requires_document: movement.requiresDocument,
        document_url: movement.documentUrl,
        matched_entity_type: movement.matchedEntityType,
        matched_entity_id: movement.matchedEntityId,
        confidence_score: movement.confidenceScore,
        notes: movement.notes,
        updated_at: movement.updatedAt.toISOString(),
        cost_center_group_id: movement.costCenterGroupId,
        cost_center_category_id: movement.costCenterCategoryId,
        supplier_id: movement.supplierId,
        vat_rate: movement.vatRate,
        vat_included: movement.vatIncluded,
      })
      .eq("id", movement.id);
    if (error) throw new Error(error.message);
  }

  async existsByHash(deduplicationHash: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("bank_movements")
      .select("id")
      .eq("deduplication_hash", deduplicationHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data !== null;
  }
}
