import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { StockCountSession, StockCountSessionStatus } from "../../entities/stock-count-session.js";
import type { StockCountLine, StockCountLineStatus } from "../../entities/stock-count-line.js";
import type { StockCountAttempt } from "../../entities/stock-count-attempt.js";
import type { StockCountComponent } from "../../entities/stock-count-component.js";

export interface StockCountSessionFilter {
  status?: StockCountSessionStatus;
  locationId?: string;
  from?: string;
  to?: string;
}

export interface StockCountRepositoryPort {
  findSessionById(organizationId: OrganizationId, id: string): Promise<StockCountSession | null>;
  findSessionsAll(organizationId: OrganizationId, filter?: StockCountSessionFilter): Promise<StockCountSession[]>;
  /** Único ponto de escrita fora de RPC que faz INSERT — devolve a entidade já com `sessionNumber` atribuído pela BD. */
  insertSession(organizationId: OrganizationId, session: StockCountSession): Promise<StockCountSession>;
  /** `expectedVersion` — lock otimista; 0 linhas afetadas ⇒ `StaleCountSessionVersionError`. */
  saveSession(organizationId: OrganizationId, session: StockCountSession, expectedVersion?: number): Promise<void>;

  findLinesBySessionId(organizationId: OrganizationId, sessionId: string, filter?: { status?: StockCountLineStatus }): Promise<StockCountLine[]>;
  findLineById(organizationId: OrganizationId, lineId: string): Promise<StockCountLine | null>;
  insertLine(organizationId: OrganizationId, line: StockCountLine): Promise<StockCountLine>;
  /** Lease de UI (secção 51): usado com `saveLine(orgId, line.claimLease(actor))`, sem `expectedVersion` — nunca a garantia de integridade, essa é o `version`. */
  saveLine(organizationId: OrganizationId, line: StockCountLine, expectedVersion?: number): Promise<void>;

  findAttemptsByLineId(organizationId: OrganizationId, lineId: string): Promise<StockCountAttempt[]>;
  findAttemptById(organizationId: OrganizationId, attemptId: string): Promise<StockCountAttempt | null>;
  /** Usado só pela resolução manual (secção 36) — insere a "tentativa manual" auditável, nunca edita uma tentativa existente. */
  insertAttempt(organizationId: OrganizationId, attempt: StockCountAttempt): Promise<StockCountAttempt>;

  findComponentsByAttemptId(organizationId: OrganizationId, attemptId: string): Promise<StockCountComponent[]>;
}
