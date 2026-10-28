import { DEFAULT_DRE_PARAMETERS, type DreParameters } from "../../domain/entities/dre-parameters.js";
import { InvalidDreParametersError } from "../../domain/errors.js";
import { resolveDreParameters, validateDreParameters } from "../../domain/services/dre-parameters.service.js";
import { platformGross } from "../../domain/services/platform-gross.service.js";

const own: DreParameters = { ...DEFAULT_DRE_PARAMETERS, deliverySalesVatPct: 14, marketingNetCents: { uber_eats: 5_000, glovo: 0, bolt_food: 0 } };

describe("resolveDreParameters", () => {
  it("usa os do mês; senão herda as taxas do mês anterior sem o marketing; senão os de omissão", () => {
    expect(resolveDreParameters(own, null)).toMatchObject({ deliverySalesVatPct: 14, source: "month", marketingNetCents: { uber_eats: 5_000 } });
    expect(resolveDreParameters(null, own)).toMatchObject({ deliverySalesVatPct: 14, source: "inherited", marketingNetCents: { uber_eats: 0 } });
    // A despesa de empréstimos é uma prestação: herda-se; um mês antigo sem ela vale 0.
    expect(resolveDreParameters(null, { ...own, loanExpenseCents: 50_000 }).loanExpenseCents).toBe(50_000);
    expect(resolveDreParameters({ ...own, loanExpenseCents: undefined as unknown as number }, null).loanExpenseCents).toBe(0);
    expect(resolveDreParameters(null, null)).toMatchObject({ deliverySalesVatPct: 15, platformCommissionPct: 30, cardFeePct: 0, source: "default" });
  });
});

describe("validateDreParameters", () => {
  it("aceita os de omissão", () => {
    expect(() => validateDreParameters(DEFAULT_DRE_PARAMETERS)).not.toThrow();
  });

  it.each([
    ["percentagem acima de 100", { deliverySalesVatPct: 120 }],
    ["percentagem negativa", { cardFeePct: -1 }],
    ["marketing negativo", { marketingNetCents: { uber_eats: -1, glovo: 0, bolt_food: 0 } }],
    ["marketing com cêntimos partidos", { marketingNetCents: { uber_eats: 10.5, glovo: 0, bolt_food: 0 } }],
    ["comissão com IVA ≥ 100%", { platformCommissionPct: 90 }],
    ["despesa de empréstimos negativa", { loanExpenseCents: -1 }],
  ])("recusa %s", (_label, patch) => {
    expect(() => validateDreParameters({ ...DEFAULT_DRE_PARAMETERS, ...patch } as DreParameters)).toThrow(InvalidDreParametersError);
  });
});

describe("platformGross", () => {
  it("631 € recebidos com comissão 30% + IVA 23% sobre a venda com IVA → 1000 € de venda", () => {
    expect(platformGross(63_100, 0, DEFAULT_DRE_PARAMETERS)).toEqual({
      grossCents: 100_000,
      netCents: 86_957,
      salesVatCents: 13_043,
      commissionNetCents: 30_000,
      commissionVatCents: 6_900,
      marketingVatCents: 0,
    });
  });

  it("comissão sobre a venda sem IVA: a mesma liquidação dá um bruto menor", () => {
    const g = platformGross(63_100, 0, { ...DEFAULT_DRE_PARAMETERS, commissionOnGross: false });
    // k = 0,30 × 1,23 ÷ 1,15
    expect(g.grossCents).toBe(Math.round(63_100 / (1 - (0.3 * 1.23) / 1.15)));
    expect(g.commissionNetCents).toBe(Math.round((0.3 * g.grossCents) / 1.15));
  });

  it("o recebido bate certo: bruto − comissão com IVA − marketing com IVA", () => {
    const g = platformGross(50_000, 8_000, DEFAULT_DRE_PARAMETERS);
    const back = g.grossCents - g.commissionNetCents - g.commissionVatCents - 8_000 - g.marketingVatCents;
    expect(Math.abs(back - 50_000)).toBeLessThanOrEqual(2);
  });
});
