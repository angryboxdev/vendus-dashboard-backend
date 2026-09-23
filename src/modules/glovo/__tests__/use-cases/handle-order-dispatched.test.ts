import { HandleOrderDispatchedUseCase } from "../../application/use-cases/handle-order-dispatched.use-case.js";
import { FakeGlovoEventBus } from "../fakes/fake-glovo-event-bus.js";
import type { GlovoOrder } from "../../domain/entities/glovo-order.js";

const minimalOrder: GlovoOrder = {
  order_id: "ord-1",
  store_id: "store-abc",
  payment_method: "DELAYED",
  currency: "EUR",
  order_code: "BA7DWBUL",
  estimated_total_price: 1500,
  courier: { name: "Flash" },
  customer: { name: "Waldo", hash: "hash-1" },
  products: [
    {
      id: "pd1",
      purchased_product_id: "A1",
      quantity: 1,
      price: 1500,
      name: "Burger",
      attributes: [],
    },
  ],
  bundled_orders: [],
  is_picked_up_by_customer: false,
};

describe("HandleOrderDispatchedUseCase", () => {
  it("publica evento ORDER_DISPATCHED no event bus", async () => {
    const bus = new FakeGlovoEventBus();
    const useCase = new HandleOrderDispatchedUseCase(bus);

    await useCase.execute(minimalOrder);

    expect(bus.events).toHaveLength(1);
    const event = bus.events[0]!;
    expect(event.type).toBe("ORDER_DISPATCHED");
    if (event.type === "ORDER_DISPATCHED") {
      expect(event.order.order_id).toBe("ord-1");
      expect(event.order.order_code).toBe("BA7DWBUL");
      expect(event.receivedAt).toBeInstanceOf(Date);
    }
  });
});
