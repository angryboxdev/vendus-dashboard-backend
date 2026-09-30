import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ForecastFeedback } from "../../domain/entities/forecast-feedback.js";
import { ForecastFeedbackAlreadySubmittedError, ForecastFeedbackNotFoundError, ReasonCodeRequiredError } from "../../domain/errors.js";
import { SubmitForecastFeedbackUseCase } from "../../application/use-cases/submit-forecast-feedback.use-case.js";
import { FakeForecastFeedbackRepository } from "../fakes/fake-forecast-feedback-repository.js";

const ORG = mintOrganizationId("org-test");

describe("SubmitForecastFeedbackUseCase", () => {
  it("grava reason_code/comment, nunca altera o forecast em si (não há port para isso)", async () => {
    const repo = new FakeForecastFeedbackRepository();
    const feedback = ForecastFeedback.create({ organizationId: ORG, locationId: "loc-1", periodDate: "2026-09-29", forecastValue: 100, actualValue: 160, deviationPercent: 0.6 });
    repo.feedback.set(feedback.id, feedback);
    const useCase = new SubmitForecastFeedbackUseCase(repo);

    await useCase.execute({ organizationId: ORG, feedbackId: feedback.id, reasonCode: "evento_local", comment: "Festival na rua", actor: "manager@fonsat.pt" });

    const saved = repo.feedback.get(feedback.id)!;
    expect(saved.toProps().reasonCode).toBe("evento_local");
    expect(saved.isSubmitted).toBe(true);
  });

  it("feedback inexistente lança erro", async () => {
    const repo = new FakeForecastFeedbackRepository();
    const useCase = new SubmitForecastFeedbackUseCase(repo);
    await expect(useCase.execute({ organizationId: ORG, feedbackId: "missing", reasonCode: "x", actor: "a" })).rejects.toThrow(ForecastFeedbackNotFoundError);
  });

  it("já respondido → não permite responder outra vez", async () => {
    const repo = new FakeForecastFeedbackRepository();
    const feedback = ForecastFeedback.create({ organizationId: ORG, locationId: "loc-1", periodDate: "2026-09-29", forecastValue: 100, actualValue: 160, deviationPercent: 0.6 });
    repo.feedback.set(feedback.id, feedback);
    const useCase = new SubmitForecastFeedbackUseCase(repo);
    await useCase.execute({ organizationId: ORG, feedbackId: feedback.id, reasonCode: "evento_local", actor: "a" });
    await expect(useCase.execute({ organizationId: ORG, feedbackId: feedback.id, reasonCode: "outro", actor: "a" })).rejects.toThrow(ForecastFeedbackAlreadySubmittedError);
  });

  it("reason_code vazio é rejeitado", async () => {
    const repo = new FakeForecastFeedbackRepository();
    const feedback = ForecastFeedback.create({ organizationId: ORG, locationId: "loc-1", periodDate: "2026-09-29", forecastValue: 100, actualValue: 160, deviationPercent: 0.6 });
    repo.feedback.set(feedback.id, feedback);
    const useCase = new SubmitForecastFeedbackUseCase(repo);
    await expect(useCase.execute({ organizationId: ORG, feedbackId: feedback.id, reasonCode: "  ", actor: "a" })).rejects.toThrow(ReasonCodeRequiredError);
  });
});
