import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetSalesReconciliationUseCase } from "../../application/use-cases/get-sales-reconciliation.use-case.js";
import type { StoredBankCredit } from "../../domain/ports/out/bank-movement-read.port.js";
import { InvalidCashFlowPeriodError } from "../../domain/errors.js";
import { DEFAULT_DRE_PARAMETERS } from "../../domain/entities/dre-parameters.js";

const organizationId = mintOrganizationId("org-a");

function useCase(credits: StoredBankCredit[], today: string) {
  const calls: Record<string, unknown[]> = { sales: [], credits: [] };
  const uc = new GetSalesReconciliationUseCase(
    {
      listDebits: async () => [],
      listCredits: async (_o, from, to) => (calls.credits!.push([from, to]), credits.filter((c) => c.date >= from && c.date <= to)),
    },
    {
      describe: (d) => ({ kind: "sales", platform: null, restaurantSale: d.startsWith("CREDITO TPA") ? "card" : null }),
    },
    {
      dailyPayments: async (_o, from, to) => (calls.sales!.push([from, to]), [{ date: "2026-09-30", cardCents: 10_000, cashCents: 0 }]),
    },
    {
      forMonth: async () => ({ own: { ...DEFAULT_DRE_PARAMETERS, cardFeePct: 1.5 }, previous: null }),
      save: async () => undefined,
    },
    () => today,
  );
  return { uc, calls };
}

const stored = (date: string, amountCents: number, description: string): StoredBankCredit => ({
  id: `m-${date}`, date, amountCents, description, reconciliationStatus: "conciliado_sem_fatura", justificationType: null,
});

describe("GetSalesReconciliationUseCase", () => {
  it("lê vendas desde 7 dias antes do mês e créditos até 7 dias depois (sem passar de hoje)", async () => {
    const { uc, calls } = useCase([stored("2026-10-01", 9_900, "CREDITO TPA BCP 1234567 MOV N 1")], "2026-10-27");

    const r = await uc.execute({ organizationId, year: 2026, month: 9 });

    expect(calls.sales).toEqual([["2026-08-25", "2026-09-30"]]);
    expect(calls.credits).toEqual([["2026-08-25", "2026-10-07"]]);
    expect(r.card).toMatchObject({ soldCents: 10_000, receivedCents: 9_900, impliedFeePct: 1 });
    expect(r.expectedCardFeePct).toBe(1.5);
  });

  it("mês corrente: os créditos param em hoje", async () => {
    const { uc, calls } = useCase([], "2026-10-16");
    await uc.execute({ organizationId, year: 2026, month: 10 });
    expect(calls.credits).toEqual([["2026-09-24", "2026-10-16"]]);
  });

  it("mês futuro é recusado", async () => {
    const { uc } = useCase([], "2026-10-16");
    await expect(uc.execute({ organizationId, year: 2026, month: 12 })).rejects.toBeInstanceOf(InvalidCashFlowPeriodError);
  });
});
