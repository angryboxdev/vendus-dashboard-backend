import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { StockCountSessionStatus, StockCountSessionType, StockCountScopeDefinition } from "../../entities/stock-count-session.js";
import type { StockCountLineStatus } from "../../entities/stock-count-line.js";
import type { TolerancePolicy } from "../../services/tolerance.service.js";

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface StockCountComponentDTO {
  id: string;
  countAreaId: string | null;
  quantity: number;
  unit: string;
  conversionFactor: number;
  baseQuantity: number;
}

export interface StockCountAttemptDTO {
  id: string;
  attemptNumber: number;
  countStartedAt: string;
  countedAt: string;
  countedQuantity: number;
  systemQuantityAtCount: number;
  movementsDuringCount: boolean;
  countedBy: string;
  isManual: boolean;
  reason: string | null;
  components: StockCountComponentDTO[];
}

export interface StockCountLineDTO {
  id: string;
  sessionId: string;
  itemId: string;
  status: StockCountLineStatus;
  selectedAttemptId: string | null;
  finalCountedQuantity: number | null;
  finalSystemQuantity: number | null;
  finalVariance: number | null;
  variancePercent: number | null;
  varianceValue: number | null;
  toleranceSnapshot: TolerancePolicy | null;
  lockedBy: string | null;
  lockedAt: string | null;
  isUnscoped: boolean;
  version: number;
  attempts: StockCountAttemptDTO[];
}

export interface StockCountSessionDTO {
  id: string;
  locationId: string;
  type: StockCountSessionType;
  sessionNumber: number;
  status: StockCountSessionStatus;
  scopeDefinition: StockCountScopeDefinition;
  blindCount: boolean;
  businessDate: string;
  startedAt: string | null;
  startedBy: string | null;
  reviewStartedAt: string | null;
  readyAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  version: number;
  lines: StockCountLineDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface StockCountSessionRowDTO {
  id: string;
  locationId: string;
  type: StockCountSessionType;
  sessionNumber: number;
  status: StockCountSessionStatus;
  businessDate: string;
  linesCount: number;
  linesPendingCount: number;
}

// ── Create ────────────────────────────────────────────────────────────────

export interface CreateCountSessionCommand {
  organizationId: OrganizationId;
  locationId?: string | null;
  type: StockCountSessionType;
  scopeDefinition: StockCountScopeDefinition;
  businessDate: string;
  actor: string;
}

export interface CreateCountSessionPort {
  execute(command: CreateCountSessionCommand): Promise<StockCountSessionDTO>;
}

// ── Start ─────────────────────────────────────────────────────────────────

export interface StartCountSessionCommand {
  organizationId: OrganizationId;
  sessionId: string;
  expectedVersion: number;
  actor: string;
  /** Só honrado quando o chamador (controller) já validou que o ator é `admin` (secção 52/64). */
  overrideOverlap?: boolean;
  overrideReason?: string | null;
}

export interface StartCountSessionPort {
  execute(command: StartCountSessionCommand): Promise<StockCountSessionDTO>;
}

// ── Submit attempt ────────────────────────────────────────────────────────

export interface SubmitCountAttemptComponentCommand {
  countAreaId?: string | null;
  quantity: number;
  unit: string;
}

export interface SubmitCountAttemptCommand {
  organizationId: OrganizationId;
  lineId: string;
  expectedLineVersion: number;
  components: SubmitCountAttemptComponentCommand[];
  countStartedAt: string;
  reason?: string | null;
  actor: string;
}

export interface SubmitCountAttemptPort {
  execute(command: SubmitCountAttemptCommand): Promise<StockCountLineDTO>;
}

// ── Request recount ───────────────────────────────────────────────────────

export interface RequestRecountCommand {
  organizationId: OrganizationId;
  lineId: string;
  expectedVersion: number;
  reason?: string | null;
  actor: string;
}

export interface RequestRecountPort {
  execute(command: RequestRecountCommand): Promise<StockCountLineDTO>;
}

// ── Resolve line ──────────────────────────────────────────────────────────

export interface ResolveCountLineCommand {
  organizationId: OrganizationId;
  lineId: string;
  expectedVersion: number;
  resolution: "select_attempt" | "manual_value";
  selectedAttemptId?: string;
  /** `manual_value` — só honrado quando o chamador já validou que o ator é `admin` (secção 64). */
  manualValue?: number;
  manualReason?: string;
  actor: string;
}

export interface ResolveCountLinePort {
  execute(command: ResolveCountLineCommand): Promise<StockCountLineDTO>;
}

// ── Finish execution ──────────────────────────────────────────────────────

export interface FinishExecutionCommand {
  organizationId: OrganizationId;
  sessionId: string;
  expectedVersion: number;
  actor: string;
}

export interface FinishExecutionPort {
  execute(command: FinishExecutionCommand): Promise<StockCountSessionDTO>;
}

// ── Mark ready ────────────────────────────────────────────────────────────

export interface MarkSessionReadyCommand {
  organizationId: OrganizationId;
  sessionId: string;
  expectedVersion: number;
  actor: string;
}

export interface MarkSessionReadyPort {
  execute(command: MarkSessionReadyCommand): Promise<StockCountSessionDTO>;
}

// ── Confirm ───────────────────────────────────────────────────────────────

export interface ConfirmCountSessionCommand {
  organizationId: OrganizationId;
  sessionId: string;
  expectedVersion: number;
  actor: string;
  businessDate?: string;
}

export interface ConfirmCountSessionPort {
  execute(command: ConfirmCountSessionCommand): Promise<StockCountSessionDTO>;
}

// ── Cancel ────────────────────────────────────────────────────────────────

export interface CancelCountSessionCommand {
  organizationId: OrganizationId;
  sessionId: string;
  expectedVersion: number;
  reason: string;
  actor: string;
}

export interface CancelCountSessionPort {
  execute(command: CancelCountSessionCommand): Promise<StockCountSessionDTO>;
}

// ── List / get ────────────────────────────────────────────────────────────

export interface ListCountSessionsCommand {
  organizationId: OrganizationId;
  status?: StockCountSessionStatus;
  locationId?: string;
  from?: string;
  to?: string;
}

export interface ListCountSessionsPort {
  execute(command: ListCountSessionsCommand): Promise<StockCountSessionRowDTO[]>;
}

export interface GetCountSessionCommand {
  organizationId: OrganizationId;
  sessionId: string;
}

export interface GetCountSessionPort {
  execute(command: GetCountSessionCommand): Promise<StockCountSessionDTO>;
}

// ── Item não previsto ─────────────────────────────────────────────────────

export interface AddUnscopedItemToSessionCommand {
  organizationId: OrganizationId;
  sessionId: string;
  itemId?: string;
  newItem?: { name: string; categoryId: string; type: string; baseUnit: string };
  actor: string;
}

export interface AddUnscopedItemToSessionPort {
  execute(command: AddUnscopedItemToSessionCommand): Promise<StockCountLineDTO>;
}

// ── Zonas ─────────────────────────────────────────────────────────────────

export interface StockCountZoneRowDTO {
  id: string;
  locationId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ListCountZonesCommand {
  organizationId: OrganizationId;
  locationId: string;
}

export interface ListCountZonesPort {
  execute(command: ListCountZonesCommand): Promise<StockCountZoneRowDTO[]>;
}

export interface CreateCountZoneCommand {
  organizationId: OrganizationId;
  locationId: string;
  name: string;
  sortOrder?: number;
}

export interface CreateCountZonePort {
  execute(command: CreateCountZoneCommand): Promise<StockCountZoneRowDTO>;
}
