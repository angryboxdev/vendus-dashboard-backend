import {
  CancellationReasonRequiredError,
  SessionAlreadyCancelledError,
  SessionAlreadyCompletedError,
  SessionHasPendingLinesError,
  SessionNotInDraftError,
  SessionNotReadyError,
  SessionNotReviewingError,
  SessionNotCountingError,
} from "../errors.js";

export type StockCountSessionStatus = "draft" | "counting" | "reviewing" | "ready" | "completed" | "cancelled";
export type StockCountSessionType = "general" | "cyclical" | "spot";

/**
 * Definição do escopo antes de materializar (secção 5/12 da task).
 * `zoneIds` é só informativo nesta ronda — não existe hoje uma tabela de
 * associação item↔zona, por isso a materialização de linhas usa apenas
 * `categoryIds`/`itemIds` (ver Design decisions do README).
 */
export interface StockCountScopeDefinition {
  categoryIds?: string[];
  zoneIds?: string[];
  itemIds?: string[];
}

interface StockCountSessionProps {
  id: string;
  organizationId: string;
  locationId: string;
  type: StockCountSessionType;
  sessionNumber: number;
  status: StockCountSessionStatus;
  scopeDefinition: StockCountScopeDefinition;
  blindCount: boolean;
  businessDate: string;
  startedAt: Date | null;
  startedBy: string | null;
  reviewStartedAt: Date | null;
  readyAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStockCountSessionProps {
  organizationId: string;
  locationId: string;
  type: StockCountSessionType;
  scopeDefinition: StockCountScopeDefinition;
  /** Snapshot do `StockCountSettings` no momento da criação — nunca uma referência viva. */
  blindCount: boolean;
  businessDate: string;
}

/**
 * Aggregate root — Sessão de Contagem Física. `create()` só define o
 * escopo (Rascunho) — não materializa linhas (secção 12: materialização só
 * ao iniciar, via RPC). Terminal em `completed`: depois disso, qualquer
 * método de mutação lança `SessionAlreadyCompletedError` (secção 59).
 */
export class StockCountSession {
  private constructor(private readonly props: StockCountSessionProps) {}

  static create(props: CreateStockCountSessionProps): StockCountSession {
    const now = new Date();
    return new StockCountSession({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      locationId: props.locationId,
      type: props.type,
      sessionNumber: 0,
      status: "draft",
      scopeDefinition: props.scopeDefinition,
      blindCount: props.blindCount,
      businessDate: props.businessDate,
      startedAt: null,
      startedBy: null,
      reviewStartedAt: null,
      readyAt: null,
      approvedAt: null,
      approvedBy: null,
      cancelledAt: null,
      cancellationReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: StockCountSessionProps): StockCountSession {
    return new StockCountSession(props);
  }

  private assertMutable(): void {
    if (this.props.status === "completed") throw new SessionAlreadyCompletedError(this.props.id);
    if (this.props.status === "cancelled") throw new SessionAlreadyCancelledError(this.props.id);
  }

  /** Mirror de domínio do que `fn_stock_count_start_session` faz na BD — usado pelos testes/fakes. */
  start(actor: string): StockCountSession {
    this.assertMutable();
    if (this.props.status !== "draft") throw new SessionNotInDraftError(this.props.id);
    const now = new Date();
    return new StockCountSession({
      ...this.props,
      status: "counting",
      startedAt: now,
      startedBy: actor,
      version: this.props.version + 1,
      updatedAt: now,
    });
  }

  /** Em contagem → Em revisão. `allLinesResolved` é calculado pelo use case (a entidade nunca olha para a coleção de linhas). */
  finishExecution(allLinesResolved: boolean, pendingCount: number): StockCountSession {
    this.assertMutable();
    if (this.props.status !== "counting") throw new SessionNotCountingError(this.props.id);
    if (!allLinesResolved) throw new SessionHasPendingLinesError(`${pendingCount} linha(s) ainda não contada(s)`);
    const now = new Date();
    return new StockCountSession({
      ...this.props,
      status: "reviewing",
      reviewStartedAt: now,
      version: this.props.version + 1,
      updatedAt: now,
    });
  }

  /** Em revisão → Pronta. */
  markReady(noPendingLines: boolean, pendingCount: number): StockCountSession {
    this.assertMutable();
    if (this.props.status !== "reviewing") throw new SessionNotReviewingError(this.props.id);
    if (!noPendingLines) throw new SessionHasPendingLinesError(`${pendingCount} linha(s) por resolver ou em recontagem`);
    const now = new Date();
    return new StockCountSession({
      ...this.props,
      status: "ready",
      readyAt: now,
      version: this.props.version + 1,
      updatedAt: now,
    });
  }

  /** Pronta → Concluída. Mirror de domínio do que `fn_stock_count_confirm` faz na BD. */
  apply(approvedBy: string): StockCountSession {
    this.assertMutable();
    if (this.props.status !== "ready") throw new SessionNotReadyError("a sessão não está no estado Pronta");
    const now = new Date();
    return new StockCountSession({
      ...this.props,
      status: "completed",
      approvedAt: now,
      approvedBy,
      version: this.props.version + 1,
      updatedAt: now,
    });
  }

  /** Só antes de `completed`; motivo sempre obrigatório (secção 60). */
  cancel(reason: string): StockCountSession {
    if (this.props.status === "completed") throw new SessionAlreadyCompletedError(this.props.id);
    if (this.props.status === "cancelled") throw new SessionAlreadyCancelledError(this.props.id);
    if (!reason || reason.trim().length === 0) throw new CancellationReasonRequiredError();
    const now = new Date();
    return new StockCountSession({
      ...this.props,
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: reason.trim(),
      version: this.props.version + 1,
      updatedAt: now,
    });
  }

  /** Estados considerados "ativos" para efeitos de deteção de sobreposição (secção 52). */
  static readonly ACTIVE_STATUSES: StockCountSessionStatus[] = ["draft", "counting", "reviewing", "ready"];

  get id(): string {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get locationId(): string {
    return this.props.locationId;
  }

  get status(): StockCountSessionStatus {
    return this.props.status;
  }

  get version(): number {
    return this.props.version;
  }

  get sessionNumber(): number {
    return this.props.sessionNumber;
  }

  get blindCount(): boolean {
    return this.props.blindCount;
  }

  toProps(): StockCountSessionProps {
    return { ...this.props };
  }
}
