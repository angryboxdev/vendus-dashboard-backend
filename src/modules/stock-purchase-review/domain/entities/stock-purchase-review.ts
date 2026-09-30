import { CancellationReasonRequiredError, ReviewAlreadyAppliedError, ReviewAlreadyCancelledError } from "../errors.js";

export type StockPurchaseReviewStatus = "pending" | "in_review" | "partial" | "ready" | "applied" | "cancelled";

export type DecisionSource = "override" | "category" | "supplier" | "unresolved";

interface StockPurchaseReviewProps {
  id: string;
  organizationId: string;
  invoiceId: string;
  status: StockPurchaseReviewStatus;
  version: number;
  sourceInvoiceVersion: number;
  sourceHash: string;
  decisionSource: DecisionSource;
  decisionCategoryId: string | null;
  decisionSupplierId: string | null;
  decisionPolicyUsed: string;
  decisionActor: string | null;
  decisionOverrideReason: string | null;
  decisionAt: Date;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  locationId: string | null;
  appliedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStockPurchaseReviewProps {
  organizationId: string;
  invoiceId: string;
  sourceInvoiceVersion: number;
  sourceHash: string;
  decisionSource: DecisionSource;
  decisionCategoryId?: string | null;
  decisionSupplierId?: string | null;
  decisionPolicyUsed: string;
  decisionActor?: string | null;
  decisionOverrideReason?: string | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  locationId?: string | null;
}

/**
 * Aggregate root — "Compra por rever". Uma fatura tem no máximo uma revisão
 * ativa (invariante garantido por UNIQUE(invoice_id) na base de dados, não
 * apenas aqui). Nunca decide sozinha se afeta stock — só regista a decisão
 * já tomada pelo `stock-review-decision.service`.
 */
export class StockPurchaseReview {
  private constructor(private readonly props: StockPurchaseReviewProps) {}

  static create(props: CreateStockPurchaseReviewProps): StockPurchaseReview {
    const now = new Date();
    return new StockPurchaseReview({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      invoiceId: props.invoiceId,
      status: "pending",
      version: 1,
      sourceInvoiceVersion: props.sourceInvoiceVersion,
      sourceHash: props.sourceHash,
      decisionSource: props.decisionSource,
      decisionCategoryId: props.decisionCategoryId ?? null,
      decisionSupplierId: props.decisionSupplierId ?? null,
      decisionPolicyUsed: props.decisionPolicyUsed,
      decisionActor: props.decisionActor ?? null,
      decisionOverrideReason: props.decisionOverrideReason ?? null,
      decisionAt: now,
      supplierName: props.supplierName,
      invoiceNumber: props.invoiceNumber,
      invoiceDate: props.invoiceDate,
      locationId: props.locationId ?? null,
      appliedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: StockPurchaseReviewProps): StockPurchaseReview {
    return new StockPurchaseReview(props);
  }

  private assertNotTerminal(): void {
    if (this.props.status === "applied") throw new ReviewAlreadyAppliedError(this.props.id);
    if (this.props.status === "cancelled") throw new ReviewAlreadyCancelledError(this.props.id);
  }

  startReview(): StockPurchaseReview {
    this.assertNotTerminal();
    return new StockPurchaseReview({ ...this.props, status: "in_review", version: this.props.version + 1, updatedAt: new Date() });
  }

  /** Decisão explícita do gestor sobre um caso UNRESOLVED — a única forma de sair desse estado. */
  decideUnresolved(outcome: "create" | "skip", actor: string): StockPurchaseReview {
    this.assertNotTerminal();
    return new StockPurchaseReview({
      ...this.props,
      decisionSource: "override",
      decisionPolicyUsed: outcome === "create" ? "manual_resolution_create" : "manual_resolution_skip",
      decisionActor: actor,
      decisionAt: new Date(),
      status: outcome === "skip" ? "cancelled" : "in_review",
      cancelledAt: outcome === "skip" ? new Date() : null,
      cancellationReason: outcome === "skip" ? "Decisão manual: não afeta stock" : null,
      version: this.props.version + 1,
      updatedAt: new Date(),
    });
  }

  /** Recalculado pelo use case a cada resolução de linha (a entidade nunca olha para a coleção de linhas). */
  refreshLinesProgress(allResolved: boolean, anyResolved: boolean): StockPurchaseReview {
    this.assertNotTerminal();
    const status = allResolved ? "ready" : anyResolved ? "partial" : this.props.status;
    if (status === this.props.status) return this;
    return new StockPurchaseReview({ ...this.props, status, version: this.props.version + 1, updatedAt: new Date() });
  }

  setLocation(locationId: string): StockPurchaseReview {
    this.assertNotTerminal();
    return new StockPurchaseReview({ ...this.props, locationId, version: this.props.version + 1, updatedAt: new Date() });
  }

  /** O `plpgsql` de confirmação é quem de facto marca `applied` na BD — este método é o espelho de domínio usado pelos testes/fakes. */
  apply(): StockPurchaseReview {
    if (this.props.status !== "ready") {
      throw new ReviewAlreadyAppliedError(this.props.id);
    }
    return new StockPurchaseReview({
      ...this.props,
      status: "applied",
      appliedAt: new Date(),
      version: this.props.version + 1,
      updatedAt: new Date(),
    });
  }

  cancel(reason: string): StockPurchaseReview {
    if (this.props.status === "applied") throw new ReviewAlreadyAppliedError(this.props.id);
    if (this.props.status === "cancelled") throw new ReviewAlreadyCancelledError(this.props.id);
    if (!reason || reason.trim().length === 0) throw new CancellationReasonRequiredError();
    return new StockPurchaseReview({
      ...this.props,
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason.trim(),
      version: this.props.version + 1,
      updatedAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get invoiceId(): string {
    return this.props.invoiceId;
  }

  get status(): StockPurchaseReviewStatus {
    return this.props.status;
  }

  get version(): number {
    return this.props.version;
  }

  get sourceHash(): string {
    return this.props.sourceHash;
  }

  get decisionSource(): DecisionSource {
    return this.props.decisionSource;
  }

  get locationId(): string | null {
    return this.props.locationId;
  }

  toProps(): StockPurchaseReviewProps {
    return { ...this.props };
  }
}
