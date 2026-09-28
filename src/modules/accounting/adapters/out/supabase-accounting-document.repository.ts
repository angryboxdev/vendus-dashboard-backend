import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import {
  AccountingDocument,
  type AccountingDocumentProps,
  type AccountingDocumentStatus,
  type AccountingDocumentType,
  type AccountingFundingSource,
  type AccountingSettlementMethod,
} from "../../domain/entities/accounting-document.js";
import type {
  AccountingDocumentFilter,
  AccountingDocumentRepositoryPort,
  PossibleDuplicateCriteria,
} from "../../domain/ports/out/accounting-document-repository.port.js";

function toEntity(row: Record<string, unknown>): AccountingDocument {
  const props: AccountingDocumentProps = {
    id: row.id as string,
    organizationId: row.org_id as string,
    documentType: row.document_type as AccountingDocumentType,
    fundingSource: row.funding_source as AccountingFundingSource,
    entityName: row.entity_name as string,
    nif: (row.nif as string | null) ?? null,
    documentNumber: (row.document_number as string | null) ?? null,
    issueDate: row.issue_date as string,
    receivedDate: (row.received_date as string | null) ?? null,
    competenceDate: (row.competence_date as string | null) ?? null,
    currency: row.currency as string,
    country: row.country as string,
    subtotalWithoutVat: row.subtotal_without_vat as number,
    vatAmount: row.vat_amount as number,
    totalWithVat: row.total_with_vat as number,
    costCenterCategoryId: (row.cost_center_category_id as string | null) ?? null,
    deductiblePercentage: (row.deductible_percentage as number | null) ?? null,
    deductibilityOverrideReason: (row.deductibility_override_reason as string | null) ?? null,
    vatDeductibleAmount: row.vat_deductible_amount as number,
    vatNonDeductibleAmount: row.vat_non_deductible_amount as number,
    settlementMethod: row.settlement_method as AccountingSettlementMethod,
    status: row.status as AccountingDocumentStatus,
    cancellationReason: (row.cancellation_reason as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdBy: row.created_by as string,
    updatedBy: row.updated_by as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
  return AccountingDocument.reconstitute(props);
}

function toRow(document: AccountingDocument): Record<string, unknown> {
  const p = document.toProps();
  return {
    id: p.id,
    document_type: p.documentType,
    funding_source: p.fundingSource,
    entity_name: p.entityName,
    nif: p.nif,
    document_number: p.documentNumber,
    issue_date: p.issueDate,
    received_date: p.receivedDate,
    competence_date: p.competenceDate,
    currency: p.currency,
    country: p.country,
    subtotal_without_vat: p.subtotalWithoutVat,
    vat_amount: p.vatAmount,
    total_with_vat: p.totalWithVat,
    cost_center_category_id: p.costCenterCategoryId,
    deductible_percentage: p.deductiblePercentage,
    deductibility_override_reason: p.deductibilityOverrideReason,
    vat_deductible_amount: p.vatDeductibleAmount,
    vat_non_deductible_amount: p.vatNonDeductibleAmount,
    settlement_method: p.settlementMethod,
    status: p.status,
    cancellation_reason: p.cancellationReason,
    notes: p.notes,
    created_by: p.createdBy,
    updated_by: p.updatedBy,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

export class SupabaseAccountingDocumentRepository implements AccountingDocumentRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(organizationId: OrganizationId, document: AccountingDocument): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("accounting_documents")
      .upsert(toRow(document), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<AccountingDocument | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("accounting_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async findAll(organizationId: OrganizationId, filter?: AccountingDocumentFilter): Promise<AccountingDocument[]> {
    let q = this.scopedQuery(organizationId).table("accounting_documents").select("*").order("issue_date", { ascending: false });
    if (filter?.from) q = q.gte("issue_date", filter.from);
    if (filter?.to) q = q.lte("issue_date", filter.to);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toEntity(r));
  }

  async findPossibleDuplicate(
    organizationId: OrganizationId,
    criteria: PossibleDuplicateCriteria,
    excludeId?: string,
  ): Promise<AccountingDocument | null> {
    if (!criteria.nif && !criteria.documentNumber) return null;
    let q = this.scopedQuery(organizationId)
      .table("accounting_documents")
      .select("*")
      .eq("issue_date", criteria.issueDate)
      .eq("total_with_vat", criteria.totalWithVat)
      .neq("status", "cancelled");
    if (criteria.nif) q = q.eq("nif", criteria.nif);
    if (criteria.documentNumber) q = q.eq("document_number", criteria.documentNumber);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }
}
