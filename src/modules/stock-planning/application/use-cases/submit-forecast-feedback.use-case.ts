import { ForecastFeedbackNotFoundError } from "../../domain/errors.js";
import type { SubmitForecastFeedbackCommand, SubmitForecastFeedbackPort } from "../../domain/ports/in/stock-planning.ports.js";
import type { ForecastFeedbackRepositoryPort } from "../../domain/ports/out/forecast-feedback-repository.port.js";

/** Só grava `reason_code`/`comment` — nunca escreve em `forecast_runs`/parâmetros do modelo (secção 35/37). */
export class SubmitForecastFeedbackUseCase implements SubmitForecastFeedbackPort {
  constructor(private readonly forecastFeedbackRepo: ForecastFeedbackRepositoryPort) {}

  async execute(command: SubmitForecastFeedbackCommand): Promise<void> {
    const feedback = await this.forecastFeedbackRepo.findById(command.organizationId, command.feedbackId);
    if (!feedback) throw new ForecastFeedbackNotFoundError(command.feedbackId);
    const submitted = feedback.submit(command.reasonCode, command.comment ?? null, command.actor);
    await this.forecastFeedbackRepo.save(command.organizationId, submitted);
  }
}
