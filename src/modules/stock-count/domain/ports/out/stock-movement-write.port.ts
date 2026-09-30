import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { TolerancePolicy } from "../../services/tolerance.service.js";

export interface StartCountSessionLineInput {
  itemId: string;
  isUnscoped?: boolean;
}

export interface StartCountSessionResult {
  sessionId: string;
  status: string;
  version: number;
  linesMaterialized: number;
}

export interface SubmitCountAttemptComponentInput {
  countAreaId: string | null;
  quantity: number;
  unit: string;
  conversionFactor: number;
  baseQuantity: number;
}

export interface SubmitCountAttemptResult {
  attemptId: string;
  attemptNumber: number;
  lineStatus: string;
  lineVersion: number;
  systemQuantityAtCount: number;
  ledgerVersionAtCount: number;
  finalVariance: number;
  variancePercent: number | null;
  varianceValue: number | null;
  movementsDuringCount: boolean;
}

export interface ConfirmCountSessionResult {
  sessionId: string;
  status: string;
  version: number;
  movementIds: string[];
  alreadyCompleted: boolean;
}

/**
 * As três únicas RPCs `plpgsql` deste módulo — PostgREST não dá transação
 * multi-tabela ad-hoc (mesma razão de `stock-purchase-review`). Ver
 * `20260930110100_stock_count_rpcs.sql`.
 */
export interface StockMovementWritePort {
  startSession(
    organizationId: OrganizationId,
    sessionId: string,
    expectedVersion: number,
    lines: StartCountSessionLineInput[],
    startedBy: string,
    overrideOverlap: boolean,
    overrideReason: string | null,
  ): Promise<StartCountSessionResult>;

  submitAttempt(
    organizationId: OrganizationId,
    countLineId: string,
    expectedLineVersion: number,
    countedQuantity: number,
    components: SubmitCountAttemptComponentInput[],
    countedBy: string,
    countStartedAt: Date,
    toleranceSnapshot: TolerancePolicy | null,
    reason: string | null,
  ): Promise<SubmitCountAttemptResult>;

  confirmSession(
    organizationId: OrganizationId,
    sessionId: string,
    expectedVersion: number,
    approvedBy: string,
    businessDate: string,
  ): Promise<ConfirmCountSessionResult>;
}
