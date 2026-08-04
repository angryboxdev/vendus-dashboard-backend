import { GetAirMenuTotalsUseCase } from "../../application/use-cases/get-airmenu-totals.use-case.js";
import { FakeAirMenuDeliveryGateway } from "../fakes/fake-air-menu-delivery-gateway.js";

describe("GetAirMenuTotalsUseCase", () => {
  it("devolve null quando gateway não está configurado", async () => {
    const useCase = new GetAirMenuTotalsUseCase();
    const result = await useCase.execute("2026-08-04");
    expect(result).toBeNull();
  });

  it("devolve os totais quando o gateway responde", async () => {
    const gateway = new FakeAirMenuDeliveryGateway();
    gateway.setTotals("2026-08-04", { uber: 48.20, glovo: 30.00, bolt: 21.50 });
    const useCase = new GetAirMenuTotalsUseCase(gateway);

    const result = await useCase.execute("2026-08-04");

    expect(result).toEqual({ uber: 48.20, glovo: 30.00, bolt: 21.50 });
  });

  it("devolve null quando o gateway falha (best-effort)", async () => {
    const gateway = new FakeAirMenuDeliveryGateway();
    gateway.shouldFail = true;
    const useCase = new GetAirMenuTotalsUseCase(gateway);

    const result = await useCase.execute("2026-08-04");

    expect(result).toBeNull();
  });

  it("devolve totais de zero quando a data não tem dados no gateway", async () => {
    const gateway = new FakeAirMenuDeliveryGateway();
    // sem setTotals → devolve { uber: 0, glovo: 0, bolt: 0 }
    const useCase = new GetAirMenuTotalsUseCase(gateway);

    const result = await useCase.execute("2026-08-04");

    expect(result).toEqual({ uber: 0, glovo: 0, bolt: 0 });
  });
});
