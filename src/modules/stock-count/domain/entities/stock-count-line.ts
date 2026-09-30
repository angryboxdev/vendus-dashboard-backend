import type { TolerancePolicy } from "../services/tolerance.service.js";
import {
  LineAlreadyResolvedError,
  LineNotCountedYetError,
  ManualResolutionReasonRequiredError,
} from "../errors.js";

export type StockCountLineStatus = "not_counted" | "counted" | "recount_required" | "resolved";

/** Lease de 5 minutos (secção 51) — só uma indicação de UI, avaliada preguiçosamente, sem cron/worker. */
export const LEASE_DURATION_MS = 5 * 60 * 1000;

interface StockCountLineProps {
  id: string;
  organizationId: string;
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
  lockedAt: Date | null;
  /** "Item não previsto" (secção 57) — adicionado depois de a sessão já ter iniciado, sempre auditado. */
  isUnscoped: boolean;
  version: number;
  createdAt: Date;
}

export interface CreateStockCountLineProps {
  organizationId: string;
  sessionId: string;
  itemId: string;
  isUnscoped?: boolean;
}

export interface RecordAttemptOutcomeInput {
  selectedAttemptId: string;
  finalCountedQuantity: number;
  finalSystemQuantity: number;
  finalVariance: number;
  variancePercent: number | null;
  varianceValue: number | null;
  toleranceSnapshot: TolerancePolicy | null;
  /** Todo movimento detetado no intervalo força recontagem, incondicionalmente (secção 26/27). */
  movementsDuringCount: boolean;
  /** Verdadeiro quando `resolveTolerance`+`breachesTolerance` (calculados no use case) indicam fora de tolerância. */
  breachesTolerance: boolean;
}

/**
 * Linha de uma sessão de contagem — uma por item. `UNIQUE(session_id,
 * item_id)` garantido pela BD. Sem método que sobrescreva
 * `finalCountedQuantity` diretamente — a única forma de mudar o valor é
 * submeter nova tentativa ou o gestor escolher explicitamente qual
 * tentativa vale.
 */
export class StockCountLine {
  private constructor(private readonly props: StockCountLineProps) {}

  static create(props: CreateStockCountLineProps): StockCountLine {
    const now = new Date();
    return new StockCountLine({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      sessionId: props.sessionId,
      itemId: props.itemId,
      status: "not_counted",
      selectedAttemptId: null,
      finalCountedQuantity: null,
      finalSystemQuantity: null,
      finalVariance: null,
      variancePercent: null,
      varianceValue: null,
      toleranceSnapshot: null,
      lockedBy: null,
      lockedAt: null,
      isUnscoped: props.isUnscoped ?? false,
      version: 1,
      createdAt: now,
    });
  }

  static reconstitute(props: StockCountLineProps): StockCountLine {
    return new StockCountLine(props);
  }

  /** `true` quando bloqueada por OUTRO utilizador dentro da janela de lease — expirado é tratado como livre (sem limpeza). */
  isLockedByAnother(actor: string, now: Date = new Date()): boolean {
    if (!this.props.lockedBy || this.props.lockedBy === actor) return false;
    if (!this.props.lockedAt) return false;
    return now.getTime() - this.props.lockedAt.getTime() < LEASE_DURATION_MS;
  }

  get lockedBy(): string | null {
    return this.props.lockedBy;
  }

  /** Reivindica o lease de UI — nunca versionado (só uma indicação, nunca a garantia de integridade). */
  claimLease(actor: string, now: Date = new Date()): StockCountLine {
    return new StockCountLine({ ...this.props, lockedBy: actor, lockedAt: now });
  }

  /** Mirror de domínio do que a RPC de submissão faz à linha — usado pelos testes/fakes. */
  recordAttemptOutcome(input: RecordAttemptOutcomeInput): StockCountLine {
    if (this.props.status === "resolved") throw new LineAlreadyResolvedError(this.props.id);
    const status: StockCountLineStatus = input.movementsDuringCount || input.breachesTolerance ? "recount_required" : "counted";
    return new StockCountLine({
      ...this.props,
      status,
      selectedAttemptId: input.selectedAttemptId,
      finalCountedQuantity: input.finalCountedQuantity,
      finalSystemQuantity: input.finalSystemQuantity,
      finalVariance: input.finalVariance,
      variancePercent: input.variancePercent,
      varianceValue: input.varianceValue,
      toleranceSnapshot: input.toleranceSnapshot,
      lockedBy: null,
      lockedAt: null,
      version: this.props.version + 1,
    });
  }

  /** Recontagem manual — sem motivo obrigatório (só a resolução manual de valor final exige motivo). */
  requestRecount(reason: string | null): StockCountLine {
    if (this.props.status === "resolved") throw new LineAlreadyResolvedError(this.props.id);
    if (this.props.status === "not_counted") throw new LineNotCountedYetError(this.props.id);
    void reason;
    return new StockCountLine({ ...this.props, status: "recount_required", version: this.props.version + 1 });
  }

  /** Gestor escolhe explicitamente qual tentativa vale (secção 36) — nunca edita/apaga tentativas anteriores. */
  resolveBySelectingAttempt(input: {
    selectedAttemptId: string;
    finalCountedQuantity: number;
    finalSystemQuantity: number;
    finalVariance: number;
    variancePercent: number | null;
    varianceValue: number | null;
  }): StockCountLine {
    if (this.props.status === "resolved") throw new LineAlreadyResolvedError(this.props.id);
    return new StockCountLine({
      ...this.props,
      status: "resolved",
      selectedAttemptId: input.selectedAttemptId,
      finalCountedQuantity: input.finalCountedQuantity,
      finalSystemQuantity: input.finalSystemQuantity,
      finalVariance: input.finalVariance,
      variancePercent: input.variancePercent,
      varianceValue: input.varianceValue,
      version: this.props.version + 1,
    });
  }

  /**
   * `resolveManually(value, reason, actor)` (secção 36) — exige motivo não
   * vazio; cria implicitamente uma "tentativa manual" auditável (a criação
   * da tentativa em si é responsabilidade do use case/repositório — este
   * método só regista o resultado nesta linha, dado o id já atribuído a
   * essa tentativa manual).
   */
  resolveManually(input: {
    manualAttemptId: string;
    value: number;
    reason: string;
    finalVariance: number;
    variancePercent: number | null;
    varianceValue: number | null;
  }): StockCountLine {
    if (this.props.status === "resolved") throw new LineAlreadyResolvedError(this.props.id);
    if (!input.reason || input.reason.trim().length === 0) throw new ManualResolutionReasonRequiredError();
    return new StockCountLine({
      ...this.props,
      status: "resolved",
      selectedAttemptId: input.manualAttemptId,
      finalCountedQuantity: input.value,
      finalVariance: input.finalVariance,
      variancePercent: input.variancePercent,
      varianceValue: input.varianceValue,
      version: this.props.version + 1,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get sessionId(): string {
    return this.props.sessionId;
  }

  get itemId(): string {
    return this.props.itemId;
  }

  get status(): StockCountLineStatus {
    return this.props.status;
  }

  get version(): number {
    return this.props.version;
  }

  get finalSystemQuantity(): number | null {
    return this.props.finalSystemQuantity;
  }

  get isUnscoped(): boolean {
    return this.props.isUnscoped;
  }

  toProps(): StockCountLineProps {
    return { ...this.props };
  }
}
