import { HandleOrderCancelledUseCase } from "../../application/use-cases/handle-order-cancelled.use-case.js";
import { FakeGlovoEventBus } from "../fakes/fake-glovo-event-bus.js";

describe("HandleOrderCancelledUseCase", () => {
  it("publica evento ORDER_CANCELLED com reason", async () => {
    const bus = new FakeGlovoEventBus();
    const useCase = new HandleOrderCancelledUseCase(bus);

    await useCase.execute({
      order_id: "ord-1",
      store_id: "store-abc",
      cancellation_reason: "PRODUCTS_NOT_AVAILABLE",
    });

    expect(bus.events).toHaveLength(1);
    const event = bus.events[0]!;
    expect(event.type).toBe("ORDER_CANCELLED");
    if (event.type === "ORDER_CANCELLED") {
      expect(event.payload.cancellation_reason).toBe("PRODUCTS_NOT_AVAILABLE");
      expect(event.receivedAt).toBeInstanceOf(Date);
    }
  });

  it("publica evento ORDER_CANCELLED sem reason", async () => {
    const bus = new FakeGlovoEventBus();
    const useCase = new HandleOrderCancelledUseCase(bus);

    await useCase.execute({ order_id: "ord-2", store_id: "store-abc" });

    expect(bus.events).toHaveLength(1);
    const event = bus.events[0]!;
    if (event.type === "ORDER_CANCELLED") {
      expect(event.payload.cancellation_reason).toBeUndefined();
    }
  });
});
