import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetCashFlowUseCase } from "../../application/use-cases/get-cash-flow.use-case.js";
import type { ExpenseReferences, ExpenseSources } from "../../domain/entities/cash-flow.js";
import type {
  BankMovementReadPort,
  StoredBankCredit,
  StoredBankDebit,
} from "../../domain/ports/out/bank-movement-read.port.js";
import type { ExpenseSourceReadPort } from "../../domain/ports/out/expense-source-read.port.js";
import { InvalidCashFlowPeriodError } from "../../domain/errors.js";
import { catalog, credit, debit, emptySources } from "../fakes/builders.js";

const organizationId = mintOrganizationId("org-a");

function storedDebit(overrides: Partial<StoredBankDebit>): StoredBankDebit {
  const { kind: _kind, ...base } = debit();
  return { ...base, description: "TRF P/ FULANO EXEMPLO", ...overrides };
}

function storedCredit(overrides: Partial<StoredBankCredit>): StoredBankCredit {
  const { kind: _kind, ...base } = credit();
  return { ...base, description: "CREDITO TPA 123", ...overrides };
}

class FakeBankMovements implements BankMovementReadPort {
  calls: [string, string][] = [];
  constructor(
    private readonly debits: StoredBankDebit[],
    private readonly credits: StoredBankCredit[] = [],
  ) {}
  async listDebits(_org: unknown, from: string, to: string) {
    this.calls.push([from, to]);
    return this.debits.filter((r) => r.date >= from && r.date <= to);
  }
  async listCredits(_org: unknown, from: string, to: string) {
    return this.credits.filter((r) => r.date >= from && r.date <= to);
  }
}

class FakeExpenseSources implements ExpenseSourceReadPort {
  refs: ExpenseReferences | null = null;
  constructor(private readonly sources: ExpenseSources) {}
  async load(_org: unknown, refs: ExpenseReferences) {
    this.refs = refs;
    return this.sources;
  }
}

function useCase(debits: StoredBankDebit[], credits: StoredBankCredit[] = [], sources = emptySources()) {
  const bank = new FakeBankMovements(debits, credits);
  const expenseSources = new FakeExpenseSources(sources);
  const uc = new GetCashFlowUseCase(
    bank,
    expenseSources,
    { load: async () => catalog },
    {
      kindOf: (d, type) => (type === "credit" ? (d.startsWith("CREDITO TPA") ? "sales" : "transfer_in") : d.startsWith("TRF P/") ? "transfer_out" : "to_review"),
    },
    () => "2026-10-16",
  );
  return { uc, bank, expenseSources };
}

describe("GetCashFlowUseCase", () => {
  it("lê o mês até hoje e os mesmos dias do mês anterior", async () => {
    const { uc, bank } = useCase([], [storedCredit({ date: "2026-10-02", amountCents: 12_000 })]);
    const report = await uc.execute({ organizationId, year: 2026, month: 10 });
    expect(bank.calls).toEqual(expect.arrayContaining([["2026-10-01", "2026-10-16"], ["2026-09-01", "2026-09-16"]]));
    expect(report.days).toHaveLength(16);
    expect(report.totals.inflowCents).toBe(12_000);
    expect(report.inflowKinds).toEqual([{ movementKind: "sales", amountCents: 12_000, previousAmountCents: 0 }]);
  });

  it("transferência enviada conciliada com a fatura de salários passa a contar em Pessoal · Salários", async () => {
    const sources = emptySources();
    sources.invoices.set("inv-sal", { mode: "simple", groupId: null, categoryId: "c-sal", allocations: [], lines: [] });
    const debits = [
      storedDebit({
        id: "m1",
        date: "2026-10-05",
        amountCents: 95_000,
        reconciliationStatus: "conciliado_com_fatura",
        links: [{ entityType: "invoice", entityId: "inv-sal", amountCents: 95_000 }],
      }),
      storedDebit({ id: "m2", date: "2026-10-06", amountCents: 5_000 }),
    ];
    const { uc, expenseSources } = useCase(debits, [], sources);
    const report = await uc.execute({ organizationId, year: 2026, month: 10 });

    expect(expenseSources.refs?.invoiceIds).toEqual(["inv-sal"]);
    expect(report.categories.map((c) => [c.key, c.name ?? c.movementKind, c.amountCents])).toEqual([
      ["g-pes", "Pessoal", 95_000],
      ["kind:transfer_out", "transfer_out", 5_000],
    ]);
    expect(report.categories[0]!.children[0]).toMatchObject({ name: "Salários", amountCents: 95_000 });
    expect(report.justification).toMatchObject({ percent: 95, pendingCount: 1 });
  });

  it("mês futuro é recusado", async () => {
    const { uc } = useCase([]);
    await expect(uc.execute({ organizationId, year: 2026, month: 11 })).rejects.toBeInstanceOf(InvalidCashFlowPeriodError);
  });
});
