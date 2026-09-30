import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { PlanningAlert } from "../../domain/entities/planning-alert.js";
import { PlanningAlertNotFoundError, SilenceReasonRequiredError } from "../../domain/errors.js";
import { AcknowledgeAlertUseCase } from "../../application/use-cases/acknowledge-alert.use-case.js";
import { SilenceAlertUseCase } from "../../application/use-cases/silence-alert.use-case.js";
import { FakePlanningAlertRepository } from "../fakes/fake-planning-alert-repository.js";
import { FakeStockItemPlanningRead } from "../fakes/fake-stock-item-planning-read.js";

const ORG = mintOrganizationId("org-test");

function seedAlert(repo: FakePlanningAlertRepository): PlanningAlert {
  const alert = PlanningAlert.create({
    organizationId: ORG,
    locationId: "loc-1",
    itemId: "tomate",
    alertType: "stockout_risk",
    severity: "alta",
    contextSnapshot: { ruptureDate: "2026-10-02" },
  });
  repo.alerts.set(alert.id, alert);
  return alert;
}

describe("AcknowledgeAlertUseCase", () => {
  it("reconhece um alerta ativo", async () => {
    const repo = new FakePlanningAlertRepository();
    const alert = seedAlert(repo);
    const stockItemRead = new FakeStockItemPlanningRead();
    const useCase = new AcknowledgeAlertUseCase(repo, stockItemRead);

    const result = await useCase.execute({ organizationId: ORG, alertId: alert.id, actor: "manager@fonsat.pt" });
    expect(result.state).toBe("acknowledged");
  });

  it("alerta inexistente lança erro", async () => {
    const repo = new FakePlanningAlertRepository();
    const stockItemRead = new FakeStockItemPlanningRead();
    const useCase = new AcknowledgeAlertUseCase(repo, stockItemRead);
    await expect(useCase.execute({ organizationId: ORG, alertId: "missing", actor: "a" })).rejects.toThrow(PlanningAlertNotFoundError);
  });
});

describe("SilenceAlertUseCase", () => {
  it("silencia com motivo obrigatório", async () => {
    const repo = new FakePlanningAlertRepository();
    const alert = seedAlert(repo);
    const stockItemRead = new FakeStockItemPlanningRead();
    const useCase = new SilenceAlertUseCase(repo, stockItemRead);

    const result = await useCase.execute({ organizationId: ORG, alertId: alert.id, reason: "sabemos, fornecedor já a caminho", actor: "manager@fonsat.pt" });
    expect(result.state).toBe("silenced");
  });

  it("sem motivo, rejeita", async () => {
    const repo = new FakePlanningAlertRepository();
    const alert = seedAlert(repo);
    const stockItemRead = new FakeStockItemPlanningRead();
    const useCase = new SilenceAlertUseCase(repo, stockItemRead);
    await expect(useCase.execute({ organizationId: ORG, alertId: alert.id, reason: "", actor: "a" })).rejects.toThrow(SilenceReasonRequiredError);
  });
});
