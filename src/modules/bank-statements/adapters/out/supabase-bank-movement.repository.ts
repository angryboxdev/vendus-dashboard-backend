import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
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
  RuleUsage,
} from "../../domain/ports/out/bank-movement-repository.port.js";
import { DuplicateMovementError } from "../../domain/errors.js";

/** True for a Postgres unique_violation (SQLSTATE 23505), matched defensively
 * on the error code first and falling back to the message since supabase-js's
 * PostgrestError typing doesn't guarantee `code` is populated on every path. */
function isUniqueViolation(error: { code?: string; message: string }): boolean {
  return error.code === "23505" || /duplicate key value violates unique constraint/i.test(error.message);
}

/** Tamanho de página das leituras longas (o PostgREST devolve no máximo 1000 linhas por pedido). */
const PAGE_SIZE = 1000;

function toEntity(row: Record<string, unknown>): BankMovement {
  return BankMovement.reconstitute({
    id: row.id as string,
    bankAccountId: (row.bank_account_id as string | null) ?? null,
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
    reconciliationAmountDiff: (row.reconciliation_amount_diff as number | null) ?? null,
    classifiedByRuleId: (row.classified_by_rule_id as string | null) ?? null,
  });
}

export class SupabaseBankMovementRepository implements BankMovementRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async saveBulk(organizationId: OrganizationId, movements: BankMovement[]): Promise<void> {
    if (movements.length === 0) return;
    const rows = movements.map((m) => ({
      id: m.id,
      bank_account_id: m.bankAccountId,
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
      // Classificação já aplicada na importação («movimentos recorrentes»).
      cost_center_group_id: m.costCenterGroupId,
      cost_center_category_id: m.costCenterCategoryId,
      supplier_id: m.supplierId,
      vat_rate: m.vatRate,
      vat_included: m.vatIncluded,
      classified_by_rule_id: m.classifiedByRuleId,
    }));
    const { error } = await this.scopedQuery(organizationId).table("bank_movements").insert(rows);
    if (error) {
      // Rede de segurança para a corrida entre existsByHash (leitura) e este
      // insert (ex: duplo clique em "Importar", ou dois uploads concorrentes
      // do mesmo extrato) — o use case já filtra duplicados dentro do próprio
      // ficheiro e contra a BD antes de chegar aqui, mas isto evita expor o
      // erro cru do Postgres ao utilizador nesse cenário residual.
      if (isUniqueViolation(error)) throw new DuplicateMovementError();
      throw new Error(error.message);
    }
  }

  async findByStatementId(
    organizationId: OrganizationId,
    statementImportId: string,
    filter?: BankMovementFilter
  ): Promise<BankMovement[]> {
    let q = this.scopedQuery(organizationId)
      .table("bank_movements")
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
    return (data ?? []).map((r) => toEntity(r as unknown as Record<string, unknown>));
  }

  async findById(organizationId: OrganizationId, id: string): Promise<BankMovement | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movements")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async findByIds(organizationId: OrganizationId, ids: string[]): Promise<BankMovement[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movements")
      .select("*")
      .in("id", ids);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as unknown as Record<string, unknown>));
  }

  async update(organizationId: OrganizationId, movement: BankMovement): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("bank_movements")
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
        reconciliation_amount_diff: movement.reconciliationAmountDiff,
        classified_by_rule_id: movement.classifiedByRuleId,
      })
      .eq("id", movement.id);
    if (error) throw new Error(error.message);
  }

  async findByAccountAndPeriod(
    organizationId: OrganizationId,
    bankAccountId: string,
    from: Date,
    to: Date
  ): Promise<BankMovement[]> {
    // Paginado: o PostgREST corta em 1000 linhas e um ano de uma conta passa disso (~1300 movimentos).
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("bank_movements")
        .select("*")
        .eq("bank_account_id", bankAccountId)
        .gte("booking_date", from.toISOString().slice(0, 10))
        .lte("booking_date", to.toISOString().slice(0, 10))
        .order("booking_date", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows.map(toEntity);
  }

  async detachRule(organizationId: OrganizationId, ruleId: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("bank_movements")
      .update({ classified_by_rule_id: null })
      .eq("classified_by_rule_id", ruleId);
    if (error) throw new Error(error.message);
  }

  async ruleUsage(organizationId: OrganizationId): Promise<RuleUsage[]> {
    const byRule = new Map<string, RuleUsage>();
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("bank_movements")
        .select("id, classified_by_rule_id, booking_date")
        .not("classified_by_rule_id", "is", null)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as { classified_by_rule_id: string; booking_date: string }[];
      for (const r of page) {
        const u = byRule.get(r.classified_by_rule_id) ?? { ruleId: r.classified_by_rule_id, movementsCount: 0, lastBookingDate: null };
        u.movementsCount += 1;
        if (!u.lastBookingDate || r.booking_date > u.lastBookingDate) u.lastBookingDate = r.booking_date;
        byRule.set(u.ruleId, u);
      }
      if (page.length < PAGE_SIZE) break;
    }
    return [...byRule.values()];
  }

  async existsByHash(organizationId: OrganizationId, deduplicationHash: string): Promise<boolean> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movements")
      .select("id")
      .eq("deduplication_hash", deduplicationHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data !== null;
  }
}
