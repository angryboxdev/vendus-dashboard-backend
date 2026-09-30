import { InvalidForecastRunTransitionError } from "../errors.js";

export type ForecastRunStatus = "running" | "completed" | "failed";

interface ForecastRunProps {
  id: string;
  organizationId: string;
  locationId: string;
  generatedAt: Date;
  dataCutoffAt: Date;
  horizonStart: string;
  horizonEnd: string;
  modelName: string;
  modelVersion: string;
  status: ForecastRunStatus;
  qualityScore: number | null;
  isLatest: boolean;
  createdAt: Date;
}

export interface StartForecastRunProps {
  organizationId: string;
  locationId: string;
  dataCutoffAt: Date;
  horizonStart: string;
  horizonEnd: string;
  modelName: string;
  modelVersion: string;
}

/**
 * Aggregate root — uma execução do pipeline diário para uma loja (secção
 * 27 da task: cada run novo passa a ser `is_latest=true`, o anterior
 * `false`, histórico sempre preservado — nunca sobrescrito). Imutável
 * depois de `completed`/`failed` (só a flag `is_latest` de runs antigos
 * muda, gerida pelo repositório, nunca pela entidade).
 */
export class ForecastRun {
  private constructor(private readonly props: ForecastRunProps) {}

  static start(props: StartForecastRunProps): ForecastRun {
    const now = new Date();
    return new ForecastRun({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      locationId: props.locationId,
      generatedAt: now,
      dataCutoffAt: props.dataCutoffAt,
      horizonStart: props.horizonStart,
      horizonEnd: props.horizonEnd,
      modelName: props.modelName,
      modelVersion: props.modelVersion,
      status: "running",
      qualityScore: null,
      isLatest: false,
      createdAt: now,
    });
  }

  static reconstitute(props: ForecastRunProps): ForecastRun {
    return new ForecastRun(props);
  }

  complete(qualityScore: number | null): ForecastRun {
    if (this.props.status !== "running") throw new InvalidForecastRunTransitionError(this.props.id, this.props.status);
    return new ForecastRun({ ...this.props, status: "completed", qualityScore, isLatest: true });
  }

  fail(): ForecastRun {
    if (this.props.status !== "running") throw new InvalidForecastRunTransitionError(this.props.id, this.props.status);
    return new ForecastRun({ ...this.props, status: "failed", isLatest: false });
  }

  get id(): string {
    return this.props.id;
  }

  get locationId(): string {
    return this.props.locationId;
  }

  get status(): ForecastRunStatus {
    return this.props.status;
  }

  get horizonStart(): string {
    return this.props.horizonStart;
  }

  get horizonEnd(): string {
    return this.props.horizonEnd;
  }

  toProps(): ForecastRunProps {
    return { ...this.props };
  }
}
