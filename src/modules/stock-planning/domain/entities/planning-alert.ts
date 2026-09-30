import { SilenceReasonRequiredError } from "../errors.js";

/**
 * Poucos tipos, todos acionáveis (secção 76) — nunca "pedido atrasado" (não
 * há encomenda rastreada nesta ronda).
 */
export type PlanningAlertType =
  | "stockout_risk"
  | "excess_stock"
  | "price_anomaly"
  | "data_quality_warning";

export type PlanningAlertSeverity = "baixa" | "media" | "alta" | "critica";
export type PlanningAlertState = "active" | "acknowledged" | "silenced" | "resolved";

interface PlanningAlertProps {
  id: string;
  organizationId: string;
  locationId: string;
  itemId: string;
  alertType: PlanningAlertType;
  fingerprint: string;
  severity: PlanningAlertSeverity;
  state: PlanningAlertState;
  firstDetectedAt: Date;
  lastUpdatedAt: Date;
  resolvedAt: Date | null;
  silencedUntil: Date | null;
  contextSnapshot: Record<string, unknown>;
}

export interface CreatePlanningAlertProps {
  organizationId: string;
  locationId: string;
  itemId: string;
  alertType: PlanningAlertType;
  severity: PlanningAlertSeverity;
  contextSnapshot: Record<string, unknown>;
}

/** `UNIQUE(org_id, location_id, item_id, alert_type)` — nunca duplica por condição, upsert por fingerprint (secções 72-73). */
export function buildAlertFingerprint(organizationId: string, locationId: string, itemId: string, alertType: PlanningAlertType): string {
  return `${organizationId}:${locationId}:${itemId}:${alertType}`;
}

/**
 * Aggregate root — um alerta ativo/reconhecido/silenciado/resolvido
 * (secção 78, estados simples). `refresh()` é chamado a cada run diário
 * quando a condição ainda existe: nunca cria uma linha nova para a mesma
 * condição, só atualiza severidade/snapshot/timestamp — e reativa
 * automaticamente um alerta que tinha sido `resolved` se a condição
 * reaparecer (nova ocorrência da mesma condição, não um alerta novo).
 */
export class PlanningAlert {
  private constructor(private readonly props: PlanningAlertProps) {}

  static create(props: CreatePlanningAlertProps): PlanningAlert {
    const now = new Date();
    return new PlanningAlert({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      locationId: props.locationId,
      itemId: props.itemId,
      alertType: props.alertType,
      fingerprint: buildAlertFingerprint(props.organizationId, props.locationId, props.itemId, props.alertType),
      severity: props.severity,
      state: "active",
      firstDetectedAt: now,
      lastUpdatedAt: now,
      resolvedAt: null,
      silencedUntil: null,
      contextSnapshot: props.contextSnapshot,
    });
  }

  static reconstitute(props: PlanningAlertProps): PlanningAlert {
    return new PlanningAlert(props);
  }

  /** Condição ainda presente no run atual — nunca duplica a linha (secção 73). Reativa se estava `resolved`. */
  refresh(severity: PlanningAlertSeverity, contextSnapshot: Record<string, unknown>): PlanningAlert {
    const reactivating = this.props.state === "resolved";
    return new PlanningAlert({
      ...this.props,
      severity,
      contextSnapshot,
      state: reactivating ? "active" : this.props.state,
      resolvedAt: reactivating ? null : this.props.resolvedAt,
      lastUpdatedAt: new Date(),
    });
  }

  /** Condição desapareceu no run atual (secção 73) — auto-resolve, nunca precisa de ação humana. */
  autoResolve(): PlanningAlert {
    if (this.props.state === "resolved") return this;
    return new PlanningAlert({ ...this.props, state: "resolved", resolvedAt: new Date(), lastUpdatedAt: new Date() });
  }

  acknowledge(): PlanningAlert {
    if (this.props.state !== "active") return this;
    return new PlanningAlert({ ...this.props, state: "acknowledged", lastUpdatedAt: new Date() });
  }

  silence(reason: string, until: Date | null): PlanningAlert {
    if (!reason || reason.trim().length === 0) throw new SilenceReasonRequiredError();
    return new PlanningAlert({
      ...this.props,
      state: "silenced",
      silencedUntil: until,
      contextSnapshot: { ...this.props.contextSnapshot, silenceReason: reason.trim() },
      lastUpdatedAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get itemId(): string {
    return this.props.itemId;
  }

  get alertType(): PlanningAlertType {
    return this.props.alertType;
  }

  get state(): PlanningAlertState {
    return this.props.state;
  }

  get fingerprint(): string {
    return this.props.fingerprint;
  }

  toProps(): PlanningAlertProps {
    return { ...this.props };
  }
}
