import { ForecastFeedbackAlreadySubmittedError, ReasonCodeRequiredError } from "../errors.js";

interface ForecastFeedbackProps {
  id: string;
  organizationId: string;
  locationId: string;
  periodDate: string;
  forecastValue: number;
  actualValue: number;
  deviationPercent: number | null;
  reasonCode: string | null;
  comment: string | null;
  submittedBy: string | null;
  submittedAt: Date | null;
  createdAt: Date;
}

export interface CreateForecastFeedbackProps {
  organizationId: string;
  locationId: string;
  periodDate: string;
  forecastValue: number;
  actualValue: number;
  deviationPercent: number | null;
}

/**
 * Uma linha por `(org, location, period_date)` — nunca duplicada por
 * reprocessamento (secção 34/97). Criada só quando o desvio é material
 * (percentagem E impacto absoluto, decidido por
 * `deviation-detection.service.ts`) — nunca perguntada duas vezes pela
 * mesma anomalia. `submit()` só grava `reason_code`/`comment` — nunca
 * altera `forecast_runs`/parâmetros do modelo (secção 35/37).
 */
export class ForecastFeedback {
  private constructor(private readonly props: ForecastFeedbackProps) {}

  static create(props: CreateForecastFeedbackProps): ForecastFeedback {
    const now = new Date();
    return new ForecastFeedback({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      locationId: props.locationId,
      periodDate: props.periodDate,
      forecastValue: props.forecastValue,
      actualValue: props.actualValue,
      deviationPercent: props.deviationPercent,
      reasonCode: null,
      comment: null,
      submittedBy: null,
      submittedAt: null,
      createdAt: now,
    });
  }

  static reconstitute(props: ForecastFeedbackProps): ForecastFeedback {
    return new ForecastFeedback(props);
  }

  submit(reasonCode: string, comment: string | null, submittedBy: string): ForecastFeedback {
    if (this.props.submittedAt !== null) throw new ForecastFeedbackAlreadySubmittedError(this.props.id);
    if (!reasonCode || reasonCode.trim().length === 0) throw new ReasonCodeRequiredError();
    return new ForecastFeedback({
      ...this.props,
      reasonCode: reasonCode.trim(),
      comment: comment?.trim() || null,
      submittedBy,
      submittedAt: new Date(),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get periodDate(): string {
    return this.props.periodDate;
  }

  get isSubmitted(): boolean {
    return this.props.submittedAt !== null;
  }

  toProps(): ForecastFeedbackProps {
    return { ...this.props };
  }
}
