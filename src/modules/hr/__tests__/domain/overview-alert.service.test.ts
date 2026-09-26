import { prioritizeAndDedupAlerts, type OverviewAlert } from "../../domain/services/overview-alert.service.js";

function makeAlert(overrides: Partial<OverviewAlert> = {}): OverviewAlert {
  return {
    alertType: "shift_no_checkout",
    entityId: "s1",
    severity: "MEDIA",
    occurredAt: "2026-09-26T09:00:00",
    employeeId: "e1",
    employeeName: "Andres",
    ...overrides,
  } as OverviewAlert;
}

describe("prioritizeAndDedupAlerts", () => {
  it("ordena por severidade (CRITICA > ALTA > MEDIA > BAIXA)", () => {
    const alerts = [
      makeAlert({ entityId: "a", severity: "BAIXA" }),
      makeAlert({ entityId: "b", severity: "CRITICA" }),
      makeAlert({ entityId: "c", severity: "ALTA" }),
      makeAlert({ entityId: "d", severity: "MEDIA" }),
    ];
    expect(prioritizeAndDedupAlerts(alerts).map((a) => a.entityId)).toEqual(["b", "c", "d", "a"]);
  });

  it("dentro da mesma severidade, mais antigo primeiro", () => {
    const alerts = [
      makeAlert({ entityId: "newer", severity: "ALTA", occurredAt: "2026-09-26T10:00:00" }),
      makeAlert({ entityId: "older", severity: "ALTA", occurredAt: "2026-09-25T10:00:00" }),
    ];
    expect(prioritizeAndDedupAlerts(alerts).map((a) => a.entityId)).toEqual(["older", "newer"]);
  });

  it("deduplica por alertType+entityId", () => {
    const alerts = [
      makeAlert({ alertType: "shift_no_checkout", entityId: "s1" }),
      makeAlert({ alertType: "shift_no_checkout", entityId: "s1" }),
      makeAlert({ alertType: "shift_late_no_arrival", entityId: "s1" }),
    ];
    expect(prioritizeAndDedupAlerts(alerts)).toHaveLength(2);
  });

  it("ID como desempate final quando severidade e data coincidem", () => {
    const alerts = [
      makeAlert({ entityId: "b", occurredAt: "2026-09-26T10:00:00" }),
      makeAlert({ entityId: "a", occurredAt: "2026-09-26T10:00:00" }),
    ];
    expect(prioritizeAndDedupAlerts(alerts).map((a) => a.entityId)).toEqual(["a", "b"]);
  });
});
