import type { ForecastHistoryDTO, GetForecastHistoryCommand, GetForecastHistoryPort } from "../../domain/ports/in/stock-planning.ports.js";
import type { ForecastFeedbackRepositoryPort } from "../../domain/ports/out/forecast-feedback-repository.port.js";
import type { ForecastRunRepositoryPort } from "../../domain/ports/out/forecast-run-repository.port.js";

const DEFAULT_LIMIT = 30;

/** Tela "Histórico de previsões" — runs recentes + desvios/feedback recentes. */
export class GetForecastHistoryUseCase implements GetForecastHistoryPort {
  constructor(
    private readonly forecastRunRepo: ForecastRunRepositoryPort,
    private readonly forecastFeedbackRepo: ForecastFeedbackRepositoryPort,
  ) {}

  async execute(command: GetForecastHistoryCommand): Promise<ForecastHistoryDTO> {
    const limit = command.limit ?? DEFAULT_LIMIT;
    const runs = await this.forecastRunRepo.listPastRuns(command.organizationId, command.locationId, limit);
    const pendingFeedback = await this.forecastFeedbackRepo.findPending(command.organizationId, command.locationId);

    return {
      runs: runs.map((r) => {
        const p = r.toProps();
        return {
          id: p.id,
          generatedAt: p.generatedAt.toISOString(),
          dataCutoffAt: p.dataCutoffAt.toISOString(),
          horizonStart: p.horizonStart,
          horizonEnd: p.horizonEnd,
          status: p.status,
          qualityScore: p.qualityScore,
          isLatest: p.isLatest,
        };
      }),
      recentDeviations: pendingFeedback.map((f) => {
        const p = f.toProps();
        return {
          feedbackId: p.id,
          periodDate: p.periodDate,
          forecastValue: p.forecastValue,
          actualValue: p.actualValue,
          deviationPercent: p.deviationPercent,
          hasFeedback: p.submittedAt !== null,
          reasonCode: p.reasonCode,
        };
      }),
    };
  }
}
