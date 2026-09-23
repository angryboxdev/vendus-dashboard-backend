import { HandleOrderPickedUpUseCase } from "../../application/use-cases/handle-order-picked-up.use-case.js";
import { FakeGlovoEventBus } from "../fakes/fake-glovo-event-bus.js";

describe("HandleOrderPickedUpUseCase", () => {
  it("publica evento ORDER_PICKED_UP no event bus", async () => {
    const bus = new FakeGlovoEventBus();
    const useCase = new HandleOrderPickedUpUseCase(bus);

    await useCase.execute({ order_id: "ord-1", store_id: "store-abc" });

    expect(bus.events).toHaveLength(1);
    const event = bus.events[0]!;
    expect(event.type).toBe("ORDER_PICKED_UP");
    if (event.type === "ORDER_PICKED_UP") {
      expect(event.payload.order_id).toBe("ord-1");
      expect(event.receivedAt).toBeInstanceOf(Date);
    }
  });
});
