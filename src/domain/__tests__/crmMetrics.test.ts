import { resolveCrmMetrics } from "../crmMetrics.js";

describe("resolveCrmMetrics", () => {
  const noCrmOrders = {
    orderCount: 0,
    ltv: 0,
    firstOrderDate: null,
    lastOrderDate: null,
  };

  it("usa o snapshot eatz quando não existem pedidos CRM", () => {
    expect(resolveCrmMetrics(noCrmOrders, {
      orderCount: 3,
      totalSpent: 75,
      avgTicket: 25,
      lastOrderDate: "2026-08-10",
    })).toEqual({
      orderCount: 3,
      ltv: 75,
      avgTicket: 25,
      firstOrderDate: null,
      lastOrderDate: "2026-08-10",
      source: "eatz_snapshot",
    });
  });

  it("considera a última compra como primeira quando o snapshot tem um pedido", () => {
    const metrics = resolveCrmMetrics(noCrmOrders, {
      orderCount: 1,
      totalSpent: 30,
      avgTicket: 30,
      lastOrderDate: "2026-08-10",
    });

    expect(metrics.firstOrderDate).toBe("2026-08-10");
  });

  it("dá prioridade aos pedidos CRM sem somar o snapshot", () => {
    const metrics = resolveCrmMetrics({
      orderCount: 2,
      ltv: 50,
      firstOrderDate: "2026-08-01",
      lastOrderDate: "2026-08-05",
    }, {
      orderCount: 6,
      totalSpent: 200,
      avgTicket: 33.33,
      lastOrderDate: "2026-08-15",
    });

    expect(metrics).toMatchObject({
      orderCount: 2,
      ltv: 50,
      avgTicket: 25,
      lastOrderDate: "2026-08-05",
      source: "crm_orders",
    });
  });

  it("distingue ausência de dados de um snapshot com zero pedidos", () => {
    expect(resolveCrmMetrics(noCrmOrders, {
      orderCount: null,
      totalSpent: null,
      avgTicket: null,
      lastOrderDate: null,
    }).source).toBe("none");

    expect(resolveCrmMetrics(noCrmOrders, {
      orderCount: 0,
      totalSpent: 0,
      avgTicket: 0,
      lastOrderDate: null,
    }).source).toBe("eatz_snapshot");
  });
});
