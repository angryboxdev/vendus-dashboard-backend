import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  ConfirmCountSessionResult,
  StartCountSessionLineInput,
  StartCountSessionResult,
  StockMovementWritePort,
  SubmitCountAttemptComponentInput,
  SubmitCountAttemptResult,
} from "../../domain/ports/out/stock-movement-write.port.js";
import type { TolerancePolicy } from "../../domain/services/tolerance.service.js";
import {
  OverlapOverrideReasonRequiredError,
  OverlappingSessionError,
  SessionNotCountingError,
  SessionNotInDraftError,
  SessionNotReadyError,
  StaleCountLineVersionError,
  StaleCountSessionVersionError,
  StockCountLineNotFoundError,
  StockCountSessionNotFoundError,
  LineAlreadyResolvedError,
} from "../../domain/errors.js";

function parseOverlap(message: string): { id: string; number: number | null } | null {
  const match = /overlapping_session:([^:]+):?(\d+)?/.exec(message);
  if (!match) return null;
  return { id: match[1] as string, number: match[2] ? Number(match[2]) : null };
}

/** As três únicas RPCs `plpgsql` deste módulo — ver `20260930110100_stock_count_rpcs.sql`. */
export class SupabaseStockMovementWriteAdapter implements StockMovementWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async startSession(
    organizationId: OrganizationId,
    sessionId: string,
    expectedVersion: number,
    lines: StartCountSessionLineInput[],
    startedBy: string,
    overrideOverlap: boolean,
    overrideReason: string | null,
  ): Promise<StartCountSessionResult> {
    const { data, error } = await this.scopedQuery(organizationId).startStockCountSession(
      sessionId,
      expectedVersion,
      lines.map((l) => ({ item_id: l.itemId, is_unscoped: l.isUnscoped ?? false })),
      startedBy,
      overrideOverlap,
      overrideReason,
    );
    if (error) {
      if (error.message.includes("session_not_found")) throw new StockCountSessionNotFoundError(sessionId);
      if (error.message.includes("stale_version")) throw new StaleCountSessionVersionError(expectedVersion);
      if (error.message.includes("override_reason_required")) throw new OverlapOverrideReasonRequiredError();
      const overlap = parseOverlap(error.message);
      if (overlap) throw new OverlappingSessionError(overlap.id, overlap.number);
      if (error.message.includes("invalid_session_state")) throw new SessionNotInDraftError(sessionId);
      throw new Error(error.message);
    }
    const r = (Array.isArray(data) ? data[0] : data) as unknown as {
      session_id: string;
      status: string;
      version: number;
      lines_materialized: number;
    };
    return { sessionId: r.session_id, status: r.status, version: r.version, linesMaterialized: Number(r.lines_materialized) };
  }

  async submitAttempt(
    organizationId: OrganizationId,
    countLineId: string,
    expectedLineVersion: number,
    countedQuantity: number,
    components: SubmitCountAttemptComponentInput[],
    countedBy: string,
    countStartedAt: Date,
    toleranceSnapshot: TolerancePolicy | null,
    reason: string | null,
  ): Promise<SubmitCountAttemptResult> {
    const { data, error } = await this.scopedQuery(organizationId).submitStockCountAttempt(
      countLineId,
      expectedLineVersion,
      countedQuantity,
      components.map((c) => ({
        count_area_id: c.countAreaId,
        quantity: c.quantity,
        unit: c.unit,
        conversion_factor: c.conversionFactor,
        base_quantity: c.baseQuantity,
      })),
      countedBy,
      countStartedAt.toISOString(),
      toleranceSnapshot as unknown as Record<string, unknown> | null,
      reason,
    );
    if (error) {
      if (error.message.includes("line_not_found")) throw new StockCountLineNotFoundError(countLineId);
      if (error.message.includes("stale_version")) throw new StaleCountLineVersionError(expectedLineVersion);
      if (error.message.includes("line_already_resolved")) throw new LineAlreadyResolvedError(countLineId);
      if (error.message.includes("session_not_counting")) throw new SessionNotCountingError("(ver linha)");
      throw new Error(error.message);
    }
    const r = (Array.isArray(data) ? data[0] : data) as unknown as {
      attempt_id: string;
      attempt_number: number;
      line_status: string;
      line_version: number;
      system_quantity_at_count: number;
      ledger_version_at_count: number;
      final_variance: number;
      variance_percent: number | null;
      variance_value: number | null;
      movements_during_count: boolean;
    };
    return {
      attemptId: r.attempt_id,
      attemptNumber: Number(r.attempt_number),
      lineStatus: r.line_status,
      lineVersion: Number(r.line_version),
      systemQuantityAtCount: Number(r.system_quantity_at_count),
      ledgerVersionAtCount: Number(r.ledger_version_at_count),
      finalVariance: Number(r.final_variance),
      variancePercent: r.variance_percent != null ? Number(r.variance_percent) : null,
      varianceValue: r.variance_value != null ? Number(r.variance_value) : null,
      movementsDuringCount: Boolean(r.movements_during_count),
    };
  }

  async confirmSession(
    organizationId: OrganizationId,
    sessionId: string,
    expectedVersion: number,
    approvedBy: string,
    businessDate: string,
  ): Promise<ConfirmCountSessionResult> {
    const { data, error } = await this.scopedQuery(organizationId).confirmStockCountSession(sessionId, expectedVersion, approvedBy, businessDate);
    if (error) {
      if (error.message.includes("stale_version")) {
        const { data: current } = await this.scopedQuery(organizationId).table("stock_count_sessions").select("version").eq("id", sessionId).maybeSingle();
        const currentVersion = (current as unknown as { version: number } | null)?.version ?? expectedVersion;
        throw new StaleCountSessionVersionError(currentVersion);
      }
      if (error.message.includes("not_ready")) throw new SessionNotReadyError("há linhas por resolver ou a sessão não está Pronta");
      if (error.message.includes("session_not_found")) throw new StockCountSessionNotFoundError(sessionId);
      throw new Error(error.message);
    }
    const r = (Array.isArray(data) ? data[0] : data) as unknown as {
      status: string;
      version: number;
      movement_ids: string[];
      already_completed: boolean;
    };
    return { sessionId, status: r.status, version: r.version, movementIds: r.movement_ids ?? [], alreadyCompleted: Boolean(r.already_completed) };
  }
}
