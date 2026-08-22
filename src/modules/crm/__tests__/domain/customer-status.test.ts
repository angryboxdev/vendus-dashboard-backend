import { calculateCustomerStatus, daysBetween } from "../../domain/customer-status.js";

const thresholds = { vipMinOrders: 4, vipMinLtv: 100, noOrderInactiveDays: 21, oneOrderInactiveDays: 30, repeatInactiveDays: 60 };
const base = { registeredAt: "2026-08-01", lastOrderDate: null, manuallyInactive: false, today: "2026-08-22", ltv: 0, thresholds };

describe("calculateCustomerStatus", () => {
  it("mantém novo sem pedidos ativo até ultrapassar 21 dias", () => {
    expect(calculateCustomerStatus({ ...base, orderCount: 0 })).toEqual({ relationship: "new", inactive: false, inactiveReason: null });
  });
  it("combina VIP com inatividade automática", () => {
    expect(calculateCustomerStatus({ ...base, orderCount: 4, ltv: 120, lastOrderDate: "2026-06-01" }))
      .toEqual({ relationship: "vip", inactive: true, inactiveReason: "repeat" });
  });
  it("prioriza inatividade manual sem perder o relacionamento", () => {
    expect(calculateCustomerStatus({ ...base, orderCount: 2, lastOrderDate: "2026-08-20", manuallyInactive: true }))
      .toEqual({ relationship: "recurring", inactive: true, inactiveReason: "manual" });
  });
  it("considera VIP por LTV mesmo com apenas um pedido", () => {
    expect(calculateCustomerStatus({ ...base, orderCount: 1, ltv: 100, lastOrderDate: "2026-08-20" }).relationship).toBe("vip");
  });
  it("mantém ativo exatamente no limite de dias e inativa apenas quando ultrapassa", () => {
    expect(calculateCustomerStatus({ ...base, orderCount: 0, registeredAt: "2026-08-01", today: "2026-08-22" }).inactive).toBe(false);
    expect(calculateCustomerStatus({ ...base, orderCount: 0, registeredAt: "2026-07-31", today: "2026-08-22" })).toMatchObject({ inactive: true, inactiveReason: "no_order" });
  });
  it("inativa cliente de um pedido e recorrente com os respetivos limites", () => {
    expect(calculateCustomerStatus({ ...base, orderCount: 1, lastOrderDate: "2026-07-22" }).inactive).toBe(true);
    expect(calculateCustomerStatus({ ...base, orderCount: 2, lastOrderDate: "2026-06-22" }).inactive).toBe(true);
  });
});

describe("daysBetween", () => {
  it("compara apenas a data e nunca devolve valor negativo", () => {
    expect(daysBetween("2026-08-01T23:59:00Z", "2026-08-03T00:01:00Z")).toBe(2);
    expect(daysBetween("2026-08-03", "2026-08-01")).toBe(0);
  });
});
