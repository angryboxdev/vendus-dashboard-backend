import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import {
  StockCountSession,
  type StockCountSessionStatus,
  type StockCountSessionType,
  type StockCountScopeDefinition,
} from "../../domain/entities/stock-count-session.js";
import { StockCountLine, type StockCountLineStatus } from "../../domain/entities/stock-count-line.js";
import { StockCountAttempt } from "../../domain/entities/stock-count-attempt.js";
import { StockCountComponent } from "../../domain/entities/stock-count-component.js";
import { StaleCountLineVersionError, StaleCountSessionVersionError } from "../../domain/errors.js";
import type { StockCountRepositoryPort, StockCountSessionFilter } from "../../domain/ports/out/stock-count-repository.port.js";

function sessionToEntity(row: Record<string, unknown>): StockCountSession {
  return StockCountSession.reconstitute({
    id: row.id as string,
    organizationId: row.org_id as string,
    locationId: row.location_id as string,
    type: row.type as StockCountSessionType,
    sessionNumber: Number(row.session_number),
    status: row.status as StockCountSessionStatus,
    scopeDefinition: (row.scope_definition as StockCountScopeDefinition) ?? {},
    blindCount: Boolean(row.blind_count),
    businessDate: row.business_date as string,
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    startedBy: (row.started_by as string | null) ?? null,
    reviewStartedAt: row.review_started_at ? new Date(row.review_started_at as string) : null,
    readyAt: row.ready_at ? new Date(row.ready_at as string) : null,
    approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
    approvedBy: (row.approved_by as string | null) ?? null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at as string) : null,
    cancellationReason: (row.cancellation_reason as string | null) ?? null,
    version: Number(row.version),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

function sessionToInsertRow(session: StockCountSession): Record<string, unknown> {
  const p = session.toProps();
  return {
    id: p.id,
    location_id: p.locationId,
    type: p.type,
    status: p.status,
    scope_definition: p.scopeDefinition,
    blind_count: p.blindCount,
    business_date: p.businessDate,
    version: p.version,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  };
}

function sessionToUpdateRow(session: StockCountSession): Record<string, unknown> {
  const p = session.toProps();
  return {
    status: p.status,
    started_at: p.startedAt ? p.startedAt.toISOString() : null,
    started_by: p.startedBy,
    review_started_at: p.reviewStartedAt ? p.reviewStartedAt.toISOString() : null,
    ready_at: p.readyAt ? p.readyAt.toISOString() : null,
    approved_at: p.approvedAt ? p.approvedAt.toISOString() : null,
    approved_by: p.approvedBy,
    cancelled_at: p.cancelledAt ? p.cancelledAt.toISOString() : null,
    cancellation_reason: p.cancellationReason,
    version: p.version,
    updated_at: p.updatedAt.toISOString(),
  };
}

function lineToEntity(row: Record<string, unknown>): StockCountLine {
  return StockCountLine.reconstitute({
    id: row.id as string,
    organizationId: row.org_id as string,
    sessionId: row.session_id as string,
    itemId: row.item_id as string,
    status: row.status as StockCountLineStatus,
    selectedAttemptId: (row.selected_attempt_id as string | null) ?? null,
    finalCountedQuantity: row.final_counted_quantity != null ? Number(row.final_counted_quantity) : null,
    finalSystemQuantity: row.final_system_quantity != null ? Number(row.final_system_quantity) : null,
    finalVariance: row.final_variance != null ? Number(row.final_variance) : null,
    variancePercent: row.variance_percent != null ? Number(row.variance_percent) : null,
    varianceValue: row.variance_value != null ? Number(row.variance_value) : null,
    toleranceSnapshot: (row.tolerance_snapshot as never) ?? null,
    lockedBy: (row.locked_by as string | null) ?? null,
    lockedAt: row.locked_at ? new Date(row.locked_at as string) : null,
    isUnscoped: Boolean(row.is_unscoped),
    version: Number(row.version),
    createdAt: new Date(row.created_at as string),
  });
}

function lineToInsertRow(line: StockCountLine): Record<string, unknown> {
  const p = line.toProps();
  return {
    id: p.id,
    session_id: p.sessionId,
    item_id: p.itemId,
    status: p.status,
    is_unscoped: p.isUnscoped,
    version: p.version,
    created_at: p.createdAt.toISOString(),
  };
}

function lineToUpdateRow(line: StockCountLine): Record<string, unknown> {
  const p = line.toProps();
  return {
    status: p.status,
    selected_attempt_id: p.selectedAttemptId,
    final_counted_quantity: p.finalCountedQuantity,
    final_system_quantity: p.finalSystemQuantity,
    final_variance: p.finalVariance,
    variance_percent: p.variancePercent,
    variance_value: p.varianceValue,
    tolerance_snapshot: p.toleranceSnapshot,
    locked_by: p.lockedBy,
    locked_at: p.lockedAt ? p.lockedAt.toISOString() : null,
    version: p.version,
  };
}

function attemptToEntity(row: Record<string, unknown>): StockCountAttempt {
  return StockCountAttempt.reconstitute({
    id: row.id as string,
    organizationId: row.org_id as string,
    countLineId: row.count_line_id as string,
    attemptNumber: Number(row.attempt_number),
    countStartedAt: new Date(row.count_started_at as string),
    countedAt: new Date(row.counted_at as string),
    countedQuantity: Number(row.counted_quantity),
    systemQuantityAtCount: Number(row.system_quantity_at_count),
    ledgerVersionAtCount: Number(row.ledger_version_at_count),
    movementsDuringCount: Boolean(row.movements_during_count),
    countedBy: row.counted_by as string,
    isManual: Boolean(row.is_manual),
    reasonNullable: (row.reason as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
  });
}

function attemptToInsertRow(attempt: StockCountAttempt): Record<string, unknown> {
  const p = attempt.toProps();
  return {
    id: p.id,
    count_line_id: p.countLineId,
    attempt_number: p.attemptNumber,
    count_started_at: p.countStartedAt.toISOString(),
    counted_at: p.countedAt.toISOString(),
    counted_quantity: p.countedQuantity,
    system_quantity_at_count: p.systemQuantityAtCount,
    ledger_version_at_count: p.ledgerVersionAtCount,
    movements_during_count: p.movementsDuringCount,
    counted_by: p.countedBy,
    is_manual: p.isManual,
    reason: p.reasonNullable,
    created_at: p.createdAt.toISOString(),
  };
}

function componentToEntity(row: Record<string, unknown>): StockCountComponent {
  return StockCountComponent.reconstitute({
    id: row.id as string,
    organizationId: row.org_id as string,
    attemptId: row.attempt_id as string,
    countAreaId: (row.count_area_id as string | null) ?? null,
    quantity: Number(row.quantity),
    unit: row.unit as string,
    conversionFactor: Number(row.conversion_factor),
    baseQuantity: Number(row.base_quantity),
    createdAt: new Date(row.created_at as string),
  });
}

export class SupabaseStockCountRepository implements StockCountRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findSessionById(organizationId: OrganizationId, id: string): Promise<StockCountSession | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_count_sessions").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? sessionToEntity(data as unknown as Record<string, unknown>) : null;
  }

  async findSessionsAll(organizationId: OrganizationId, filter?: StockCountSessionFilter): Promise<StockCountSession[]> {
    let q = this.scopedQuery(organizationId).table("stock_count_sessions").select("*").order("business_date", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.locationId) q = q.eq("location_id", filter.locationId);
    if (filter?.from) q = q.gte("business_date", filter.from);
    if (filter?.to) q = q.lte("business_date", filter.to);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(sessionToEntity);
  }

  async insertSession(organizationId: OrganizationId, session: StockCountSession): Promise<StockCountSession> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_count_sessions")
      .insert(sessionToInsertRow(session))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return sessionToEntity(data as unknown as Record<string, unknown>);
  }

  async saveSession(organizationId: OrganizationId, session: StockCountSession, expectedVersion?: number): Promise<void> {
    let q = this.scopedQuery(organizationId).table("stock_count_sessions").update(sessionToUpdateRow(session)).eq("id", session.id);
    if (expectedVersion !== undefined) q = q.eq("version", expectedVersion);
    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    if (expectedVersion !== undefined && (!data || data.length === 0)) {
      throw new StaleCountSessionVersionError(session.version);
    }
  }

  async findLinesBySessionId(
    organizationId: OrganizationId,
    sessionId: string,
    filter?: { status?: StockCountLineStatus },
  ): Promise<StockCountLine[]> {
    let q = this.scopedQuery(organizationId).table("stock_count_lines").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    if (filter?.status) q = q.eq("status", filter.status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(lineToEntity);
  }

  async findLineById(organizationId: OrganizationId, lineId: string): Promise<StockCountLine | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_count_lines").select("*").eq("id", lineId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? lineToEntity(data as unknown as Record<string, unknown>) : null;
  }

  async insertLine(organizationId: OrganizationId, line: StockCountLine): Promise<StockCountLine> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_count_lines").insert(lineToInsertRow(line)).select("*").single();
    if (error) throw new Error(error.message);
    return lineToEntity(data as unknown as Record<string, unknown>);
  }

  async saveLine(organizationId: OrganizationId, line: StockCountLine, expectedVersion?: number): Promise<void> {
    let q = this.scopedQuery(organizationId).table("stock_count_lines").update(lineToUpdateRow(line)).eq("id", line.id);
    if (expectedVersion !== undefined) q = q.eq("version", expectedVersion);
    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    if (expectedVersion !== undefined && (!data || data.length === 0)) {
      throw new StaleCountLineVersionError(line.version);
    }
  }

  async findAttemptsByLineId(organizationId: OrganizationId, lineId: string): Promise<StockCountAttempt[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_count_attempts")
      .select("*")
      .eq("count_line_id", lineId)
      .order("attempt_number", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(attemptToEntity);
  }

  async findAttemptById(organizationId: OrganizationId, attemptId: string): Promise<StockCountAttempt | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_count_attempts").select("*").eq("id", attemptId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? attemptToEntity(data as unknown as Record<string, unknown>) : null;
  }

  async insertAttempt(organizationId: OrganizationId, attempt: StockCountAttempt): Promise<StockCountAttempt> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_count_attempts")
      .insert(attemptToInsertRow(attempt))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return attemptToEntity(data as unknown as Record<string, unknown>);
  }

  async findComponentsByAttemptId(organizationId: OrganizationId, attemptId: string): Promise<StockCountComponent[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_count_components")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(componentToEntity);
  }
}
