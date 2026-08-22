import { calculateNextFollowUp } from "../crmFollowUpEngine.js";
import type { CrmCustomer, CrmOrder, CrmParams } from "../crmTypes.js";

const params = {
  seg01Days212: 3,
  seg01Days213: 10,
  seg01DaysTransition: 15,
} as CrmParams;

const customer = {
  registeredAt: "2026-08-01",
  eatzRegisteredAt: "2026-08-02",
  seg07Path: null,
} as CrmCustomer;

describe("calculateNextFollowUp com snapshot eatz", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-11T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("usa a data eatz como primeira compra quando existe um único pedido", () => {
    const next = calculateNextFollowUp(customer, "SEG-01", [], [], params, {
      orderCount: 1,
      ltv: 30,
      lastOrderDate: "2026-08-10",
    });

    expect(next).toMatchObject({ date: "2026-08-10", scriptCode: "2.1.1" });
  });

  it("mantém pedidos CRM como fonte prioritária", () => {
    const order = {
      id: "order-1",
      customerId: "C001",
      orderDate: "2026-08-11",
      amount: 20,
      status: "concluído",
      notes: null,
      createdAt: "2026-08-11T12:00:00Z",
    } satisfies CrmOrder;

    const next = calculateNextFollowUp(customer, "SEG-01", [order], [], params, {
      orderCount: 1,
      ltv: 30,
      lastOrderDate: "2026-08-01",
    });

    expect(next).toMatchObject({ date: "2026-08-11", scriptCode: "2.1.1" });
  });
});
