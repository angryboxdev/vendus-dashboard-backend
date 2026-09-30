import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { ForecastFeedback } from "../../domain/entities/forecast-feedback.js";
import type { DetectForecastDeviationCommand, DetectForecastDeviationPort, DetectForecastDeviationResultDTO } from "../../domain/ports/in/stock-planning.ports.js";
import type { DemandActualsRepositoryPort } from "../../domain/ports/out/demand-actuals-repository.port.js";
import type { ForecastFeedbackRepositoryPort } from "../../domain/ports/out/forecast-feedback-repository.port.js";
import type { ForecastRunRepositoryPort } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";
import { detectDeviation } from "../../domain/services/deviation-detection.service.js";
import { yesterdayISO } from "./date-utils.js";

/** Fração (20%) e impacto absoluto mínimo (10 unidades) — defaults configuráveis por comando, nunca hardcoded num único ponto (secção 32). */
export const DEFAULT_DEVIATION_PERCENT_THRESHOLD = 0.2;
export const DEFAULT_DEVIATION_ABSOLUTE_THRESHOLD = 10;

/**
 * Corre depois do fecho do dia (mesmo cron, passo adicional): compara a
 * previsão agregada (soma de `predicted_quantity` de todas as fontes de
 * procura ativas, do run que cobria esse dia) com o total real vendido
 * nesse dia (secções 31-38, 96-97). Simplificação documentada no README:
 * usa quantidade agregada, não receita ponderada (nem toda fonte de
 * procura tem preço de venda ligado de forma uniforme neste round) — o
 * invariante central (desvio material → 1 feedback, nunca duplicado) fica
 * preservado de qualquer forma.
 */
export class DetectForecastDeviationUseCase implements DetectForecastDeviationPort {
  constructor(
    private readonly locationRead: LocationReadPort,
    private readonly forecastRunRepo: ForecastRunRepositoryPort,
    private readonly demandActualsRepo: DemandActualsRepositoryPort,
    private readonly forecastFeedbackRepo: ForecastFeedbackRepositoryPort,
  ) {}

  async execute(command: DetectForecastDeviationCommand): Promise<DetectForecastDeviationResultDTO[]> {
    const locations = command.locationId ? [{ id: command.locationId }] : await this.locationRead.listActive(command.organizationId);
    const periodDate = command.periodDate ?? yesterdayISO();
    const percentThreshold = command.percentThreshold ?? DEFAULT_DEVIATION_PERCENT_THRESHOLD;
    const absoluteThreshold = command.absoluteThreshold ?? DEFAULT_DEVIATION_ABSOLUTE_THRESHOLD;

    const results: DetectForecastDeviationResultDTO[] = [];
    for (const location of locations) {
      results.push(await this.runForLocation(command.organizationId, location.id, periodDate, percentThreshold, absoluteThreshold));
    }
    return results;
  }

  private async runForLocation(
    organizationId: OrganizationId,
    locationId: string,
    periodDate: string,
    percentThreshold: number,
    absoluteThreshold: number,
  ): Promise<DetectForecastDeviationResultDTO> {
    const pastRuns = await this.forecastRunRepo.listPastRuns(organizationId, locationId, 30);
    const coveringRun = pastRuns.find((r) => r.horizonStart === periodDate) ?? null;
    if (!coveringRun) return { locationId, feedbackCreated: false, deviationPercent: null };

    const demandPoints = await this.forecastRunRepo.findDemandPointsForRun(organizationId, coveringRun.id);
    const pointsForDay = demandPoints.filter((p) => p.forecastDate === periodDate);
    if (pointsForDay.length === 0) return { locationId, feedbackCreated: false, deviationPercent: null };

    const forecastValue = pointsForDay.reduce((sum, p) => sum + p.predictedQuantity, 0);

    let actualValue = 0;
    for (const point of pointsForDay) {
      const history = await this.demandActualsRepo.findHistory({
        organizationId,
        locationId,
        demandSourceType: point.demandSourceType,
        demandSourceRef: point.demandSourceRef,
        since: periodDate,
        until: periodDate,
      });
      actualValue += history.reduce((sum, h) => sum + h.quantitySold, 0);
    }

    const deviation = detectDeviation({ forecastValue, actualValue, percentThreshold, absoluteThreshold });
    if (!deviation.isMaterial) return { locationId, feedbackCreated: false, deviationPercent: deviation.deviationPercent };

    const existing = await this.forecastFeedbackRepo.findByPeriod(organizationId, locationId, periodDate);
    if (existing) return { locationId, feedbackCreated: false, deviationPercent: deviation.deviationPercent };

    const feedback = ForecastFeedback.create({
      organizationId,
      locationId,
      periodDate,
      forecastValue,
      actualValue,
      deviationPercent: deviation.deviationPercent,
    });
    await this.forecastFeedbackRepo.insert(organizationId, feedback);
    return { locationId, feedbackCreated: true, deviationPercent: deviation.deviationPercent };
  }
}
