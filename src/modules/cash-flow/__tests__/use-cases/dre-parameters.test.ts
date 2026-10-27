import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetDreParametersUseCase, SaveDreParametersUseCase } from "../../application/use-cases/dre-parameters.use-case.js";
import { DEFAULT_DRE_PARAMETERS, type DreParameters } from "../../domain/entities/dre-parameters.js";
import type { DreParametersRepositoryPort } from "../../domain/ports/out/dre-parameters-repository.port.js";
import { InvalidCashFlowPeriodError, InvalidDreParametersError } from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");
const today = () => "2026-10-27";

function repo() {
  const saved: unknown[] = [];
  const store = new Map<string, DreParameters>();
  const r: DreParametersRepositoryPort = {
    forMonth: async (_o, y, m) => ({ own: store.get(`${y}-${m}`) ?? null, previous: store.get("2026-9") ?? null }),
    save: async (_o, y, m, p, by) => {
      saved.push([y, m, p, by]);
      store.set(`${y}-${m}`, p);
    },
  };
  return { r, saved, store };
}

describe("DRE parameters use cases", () => {
  it("grava o mês e passa a lê-lo como «month»; o mês seguinte herda as taxas", async () => {
    const { r, saved } = repo();
    const save = new SaveDreParametersUseCase(r, today);
    const params = { ...DEFAULT_DRE_PARAMETERS, deliverySalesVatPct: 14, marketingNetCents: { uber_eats: 12_000, glovo: 0, bolt_food: 0 } };

    const result = await save.execute({ organizationId, year: 2026, month: 9, parameters: params, updatedBy: "gestor@exemplo.pt" });

    expect(result).toMatchObject({ deliverySalesVatPct: 14, source: "month" });
    expect(saved).toEqual([[2026, 9, params, "gestor@exemplo.pt"]]);
    const get = new GetDreParametersUseCase(r, today);
    expect(await get.execute({ organizationId, year: 2026, month: 9 })).toMatchObject({ source: "month", marketingNetCents: { uber_eats: 12_000 } });
    expect(await get.execute({ organizationId, year: 2026, month: 10 })).toMatchObject({ source: "inherited", deliverySalesVatPct: 14, marketingNetCents: { uber_eats: 0 } });
  });

  it("marketing em falta conta como 0; valores inválidos e meses futuros são recusados", async () => {
    const { r } = repo();
    const save = new SaveDreParametersUseCase(r, today);
    const partial = { ...DEFAULT_DRE_PARAMETERS, marketingNetCents: { uber_eats: 100 } } as unknown as DreParameters;
    expect(await save.execute({ organizationId, year: 2026, month: 10, parameters: partial, updatedBy: null })).toMatchObject({
      marketingNetCents: { uber_eats: 100, glovo: 0, bolt_food: 0 },
    });
    await expect(
      save.execute({ organizationId, year: 2026, month: 10, parameters: { ...DEFAULT_DRE_PARAMETERS, cardFeePct: 200 }, updatedBy: null }),
    ).rejects.toBeInstanceOf(InvalidDreParametersError);
    await expect(
      save.execute({ organizationId, year: 2026, month: 12, parameters: DEFAULT_DRE_PARAMETERS, updatedBy: null }),
    ).rejects.toBeInstanceOf(InvalidCashFlowPeriodError);
  });
});
